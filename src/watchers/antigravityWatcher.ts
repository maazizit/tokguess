import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { estimateTokensFromText } from '../estimator';
import { TokenEvent } from '../types';

type Handler = (event: TokenEvent) => void;

interface AntigravityUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AntigravityLine {
  step_index?: number;
  source?: string;
  type?: string;
  status?: string;
  content?: string;
  created_at?: string;
  model?: string | { id?: string; display_name?: string };
  usage?: AntigravityUsage;
  token_usage?: AntigravityUsage;
  context_window?: {
    current_usage?: AntigravityUsage;
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
}

const MODEL_TYPES = new Set([
  'PLANNER_RESPONSE',
  'SEARCH_WEB',
  'MODEL_RESPONSE',
  'ASSISTANT_MESSAGE',
  'TOOL_RESULT'
]);

export class AntigravityWatcher implements vscode.Disposable {
  private handlers: Handler[] = [];
  private filePositions = new Map<string, number>();
  private processedKeys = new Set<string>();
  private fsWatchers: fs.FSWatcher[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private knownFiles = new Set<string>();
  private globalState: vscode.Memento | undefined;
  private readonly searchRoots: string[];

  private static readonly KEY = 'tokguess.antigravity.state';
  private static readonly LOG_REL = path.join('.system_generated', 'logs', 'transcript.jsonl');

  constructor(customPath?: string) {
    const home = os.homedir();
    this.searchRoots = customPath?.trim()
      ? [customPath.trim()]
      : [
          path.join(home, '.gemini', 'antigravity-cli', 'brain'),
          path.join(home, '.gemini', 'antigravity', 'brain')
        ];
  }

  get paths(): string[] {
    return this.searchRoots;
  }

  isActive(): boolean {
    return this.searchRoots.some((r) => fs.existsSync(r));
  }

  onEvent(handler: Handler): void {
    this.handlers.push(handler);
  }

  activate(context: vscode.ExtensionContext): void {
    this.globalState = context.globalState;
    this.loadState();
    this.discover();
    this.pollTimer = setInterval(() => this.discover(), 45_000);
  }

  rescan(): void {
    this.filePositions.clear();
    this.processedKeys.clear();
    this.knownFiles.clear();
    for (const w of this.fsWatchers) {
      w.close();
    }
    this.fsWatchers = [];
    if (this.globalState) {
      void this.globalState.update(AntigravityWatcher.KEY, { ids: [], pos: {} });
    }
    this.discover();
  }

  private loadState(): void {
    if (!this.globalState) {
      return;
    }
    const s = this.globalState.get<{ ids: string[]; pos: Record<string, number> }>(
      AntigravityWatcher.KEY,
      { ids: [], pos: {} }
    );
    for (const id of s.ids) {
      this.processedKeys.add(id);
    }
    for (const [k, v] of Object.entries(s.pos)) {
      this.filePositions.set(k, v);
    }
  }

  private saveState(): void {
    if (!this.globalState) {
      return;
    }
    const pos: Record<string, number> = {};
    for (const [k, v] of this.filePositions) {
      pos[k] = v;
    }
    void this.globalState.update(AntigravityWatcher.KEY, {
      ids: [...this.processedKeys].slice(-5000),
      pos
    });
  }

  private discover(): void {
    for (const root of this.searchRoots) {
      if (!fs.existsSync(root)) {
        continue;
      }
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const transcript = path.join(root, entry.name, AntigravityWatcher.LOG_REL);
        if (!fs.existsSync(transcript)) {
          continue;
        }
        this.trackFile(transcript, entry.name);
      }
    }
  }

  private trackFile(filePath: string, conversationId: string): void {
    if (this.knownFiles.has(filePath)) {
      this.tail(filePath, conversationId);
      return;
    }
    this.knownFiles.add(filePath);
    this.tail(filePath, conversationId);
    try {
      const watcher = fs.watch(filePath, () => this.tail(filePath, conversationId));
      this.fsWatchers.push(watcher);
    } catch {
      /* ignore */
    }
  }

  private tail(filePath: string, conversationId: string): void {
    try {
      const stat = fs.statSync(filePath);
      const pos = this.filePositions.get(filePath) ?? 0;
      if (stat.size <= pos) {
        return;
      }

      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - pos);
      fs.readSync(fd, buf, 0, buf.length, pos);
      fs.closeSync(fd);
      this.filePositions.set(filePath, stat.size);

      for (const line of buf.toString('utf8').split('\n')) {
        if (!line.trim()) {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as AntigravityLine;
          this.process(parsed, conversationId);
        } catch {
          /* skip */
        }
      }
      this.saveState();
    } catch {
      /* ignore */
    }
  }

  private process(line: AntigravityLine, conversationId: string): void {
    if (line.status && line.status !== 'DONE') {
      return;
    }

    const stepIndex = line.step_index ?? -1;
    const dedup = `antigravity:${conversationId}:${stepIndex}:${line.type ?? 'step'}`;
    if (this.processedKeys.has(dedup)) {
      return;
    }

    const usage = extractUsage(line);
    const model = resolveModel(line);
    let inputTokens = usage?.input ?? 0;
    let outputTokens = usage?.output ?? 0;
    let cacheRead = usage?.cacheRead ?? 0;
    let cacheWrite = usage?.cacheWrite ?? 0;
    let estimated = usage?.estimated ?? false;

    if (!usage) {
      const text = line.content?.trim();
      if (!text) {
        return;
      }
      if (line.source === 'USER_EXPLICIT' || line.type === 'USER_INPUT') {
        inputTokens = estimateTokensFromText(text);
      } else if (line.source === 'MODEL' || MODEL_TYPES.has(line.type ?? '')) {
        outputTokens = estimateTokensFromText(text);
      } else {
        return;
      }
      estimated = true;
    }

    if (inputTokens + outputTokens + cacheRead + cacheWrite <= 0) {
      return;
    }

    this.processedKeys.add(dedup);
    this.emit({
      id: dedup,
      timestamp: line.created_at ? new Date(line.created_at).getTime() : Date.now(),
      source: 'antigravity',
      type: 'message',
      model: model || 'gemini',
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      premiumRequests: 0,
      sessionId: conversationId,
      estimated
    });
  }

  private emit(event: TokenEvent): void {
    for (const h of this.handlers) {
      h(event);
    }
  }

  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    for (const w of this.fsWatchers) {
      w.close();
    }
    this.saveState();
  }
}

function extractUsage(line: AntigravityLine):
  | { input: number; output: number; cacheRead: number; cacheWrite: number; estimated: boolean }
  | undefined {
  const candidates: AntigravityUsage[] = [];
  if (line.usage) {
    candidates.push(line.usage);
  }
  if (line.token_usage) {
    candidates.push(line.token_usage);
  }
  if (line.context_window?.current_usage) {
    candidates.push(line.context_window.current_usage);
  }

  for (const u of candidates) {
    const input = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    if (input + output + cacheRead + cacheWrite > 0) {
      return { input, output, cacheRead, cacheWrite, estimated: false };
    }
  }

  return undefined;
}

function resolveModel(line: AntigravityLine): string {
  if (typeof line.model === 'string' && line.model.trim()) {
    return line.model.trim();
  }
  if (line.model && typeof line.model === 'object') {
    return line.model.display_name ?? line.model.id ?? 'gemini';
  }
  return 'gemini';
}
