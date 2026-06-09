import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PrecisionModeController } from '../precision/precisionMode';
import { TokenEvent } from '../types';

type Handler = (event: TokenEvent) => void;

/**
 * Tails the JSON-lines file written by Copilot Chat's official OTel `file`
 * exporter (github.copilot.chat.otel.exporterType = "file") and converts
 * spans carrying gen_ai.usage.* token counts into real TokenEvents.
 *
 * Defensive parsing: each line may be a full OTLP payload, a scopeSpans
 * fragment, or a single span; attributes may be OTLP arrays or plain maps.
 */
export class CopilotOtelFileWatcher implements vscode.Disposable {
  private handlers: Handler[] = [];
  private watcher?: fs.FSWatcher;
  private pollTimer?: ReturnType<typeof setInterval>;
  private offset = 0;
  private processedIds = new Set<string>();
  private precision?: PrecisionModeController;

  constructor(private readonly filePath = defaultOtelFilePath()) {}

  static defaultPath(): string {
    return defaultOtelFilePath();
  }

  getPath(): string {
    return this.filePath;
  }

  isActive(): boolean {
    return Boolean(this.watcher || this.pollTimer);
  }

  onEvent(handler: Handler): void {
    this.handlers.push(handler);
  }

  start(precision: PrecisionModeController): void {
    this.stop();
    this.precision = precision;

    // Catch up on existing content once, then tail new writes.
    this.offset = 0;
    this.readNew();

    const dir = path.dirname(this.filePath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      this.watcher = fs.watch(dir, (_evt, name) => {
        if (name === path.basename(this.filePath)) {
          this.readNew();
        }
      });
    } catch {
      /* fall back to polling only */
    }
    // fs.watch can miss events on macOS — low-cost poll as safety net.
    this.pollTimer = setInterval(() => this.readNew(), 5000);
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private readNew(): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      return;
    }
    if (stat.size < this.offset) {
      this.offset = 0; // file rotated/truncated
    }
    if (stat.size === this.offset) {
      return;
    }

    let chunk: string;
    try {
      const fd = fs.openSync(this.filePath, 'r');
      const buf = Buffer.alloc(stat.size - this.offset);
      fs.readSync(fd, buf, 0, buf.length, this.offset);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch {
      return;
    }

    // Only advance past complete lines; a partial trailing line is re-read next time.
    const lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline === -1) {
      return;
    }
    this.offset += Buffer.byteLength(chunk.slice(0, lastNewline + 1), 'utf8');

    let gotSpan = false;
    for (const line of chunk.slice(0, lastNewline).split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        for (const span of extractSpans(parsed)) {
          const event = spanToEvent(span);
          if (!event || this.processedIds.has(event.id)) {
            continue;
          }
          this.processedIds.add(event.id);
          gotSpan = true;
          for (const h of this.handlers) {
            h(event);
          }
        }
      } catch {
        /* not JSON or unknown shape — skip line */
      }
    }

    if (gotSpan) {
      this.precision?.markOtelIngest();
    }
    if (this.processedIds.size > 8000) {
      this.processedIds = new Set([...this.processedIds].slice(-4000));
    }
  }

  dispose(): void {
    this.stop();
  }
}

function defaultOtelFilePath(): string {
  return path.join(os.homedir(), '.tokguess', 'copilot-otel.jsonl');
}

interface RawSpan {
  name?: string;
  traceId?: string;
  spanId?: string;
  startTimeUnixNano?: string | number;
  attributes?: unknown;
}

/** Accepts OTLP payloads, scopeSpans fragments, or single span objects. */
function extractSpans(value: unknown): RawSpan[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  const obj = value as Record<string, unknown>;

  if (Array.isArray(obj.resourceSpans)) {
    const out: RawSpan[] = [];
    for (const rs of obj.resourceSpans as Array<Record<string, unknown>>) {
      for (const ss of (rs.scopeSpans as Array<Record<string, unknown>> | undefined) ?? []) {
        out.push(...(((ss.spans as RawSpan[] | undefined) ?? [])));
      }
    }
    return out;
  }
  if (Array.isArray(obj.scopeSpans)) {
    const out: RawSpan[] = [];
    for (const ss of obj.scopeSpans as Array<Record<string, unknown>>) {
      out.push(...(((ss.spans as RawSpan[] | undefined) ?? [])));
    }
    return out;
  }
  if (Array.isArray(obj.spans)) {
    return obj.spans as RawSpan[];
  }
  if (obj.name !== undefined || obj.attributes !== undefined) {
    return [obj as RawSpan];
  }
  return [];
}

/** Attributes can be OTLP arrays ([{key,value:{intValue}}]) or plain maps. */
function attrMap(attributes: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (Array.isArray(attributes)) {
    for (const a of attributes as Array<{ key?: string; value?: Record<string, unknown> }>) {
      if (!a?.key) {
        continue;
      }
      const v = a.value;
      if (v && typeof v === 'object') {
        map.set(a.key, v.stringValue ?? v.intValue ?? v.doubleValue ?? v.boolValue);
      } else {
        map.set(a.key, v);
      }
    }
  } else if (attributes && typeof attributes === 'object') {
    for (const [k, v] of Object.entries(attributes as Record<string, unknown>)) {
      map.set(k, v);
    }
  }
  return map;
}

function num(map: Map<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = map.get(key);
    if (v === undefined || v === null) {
      continue;
    }
    const n = Number(v);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return 0;
}

function str(map: Map<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = map.get(key);
    if (typeof v === 'string' && v) {
      return v;
    }
  }
  return undefined;
}

function spanToEvent(span: RawSpan): TokenEvent | null {
  const attrs = attrMap(span.attributes);
  const name = (span.name ?? '').toLowerCase();
  const op = str(attrs, 'gen_ai.operation.name') ?? '';

  const isAgentSpan =
    name.includes('invoke_agent') || op === 'invoke_agent' || name.includes('copilot');
  if (!isAgentSpan) {
    return null;
  }

  const input = num(
    attrs,
    'gen_ai.usage.input_tokens',
    'github.copilot.usage.input_tokens',
    'copilot_chat.usage.input_tokens'
  );
  const output = num(
    attrs,
    'gen_ai.usage.output_tokens',
    'github.copilot.usage.output_tokens',
    'copilot_chat.usage.output_tokens'
  );
  const cacheRead = num(attrs, 'gen_ai.usage.cache_read.input_tokens');
  const total = num(attrs, 'Tokens', 'tokens', 'gen_ai.usage.total_tokens');

  let inTok = input;
  let outTok = output;
  if (inTok === 0 && outTok === 0 && total > 0) {
    inTok = Math.floor(total * 0.85);
    outTok = total - inTok;
  }
  if (inTok + outTok <= 0) {
    return null;
  }

  const traceId = span.traceId ?? 'na';
  const spanId = span.spanId ?? String(span.startTimeUnixNano ?? Date.now());
  const startNano = Number(span.startTimeUnixNano ?? 0);
  const timestamp = startNano > 0 ? Math.floor(startNano / 1_000_000) : Date.now();
  const sessionId =
    str(attrs, 'gen_ai.conversation.id', 'copilot_chat.session_id', 'session.id') ??
    `otel-${spanId}`;

  return {
    id: `otel-file-${traceId}-${spanId}`,
    timestamp,
    source: 'copilot',
    type: 'message',
    model:
      str(attrs, 'gen_ai.request.model', 'gen_ai.response.model', 'model') ?? 'copilot',
    inputTokens: inTok,
    outputTokens: outTok,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: 0,
    premiumRequests: 0,
    sessionId,
    estimated: false,
    replace: true
  };
}
