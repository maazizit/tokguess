import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TokenEvent } from '../types';

type Handler = (event: TokenEvent) => void;

interface ClaudeLine {
  type?: string;
  sessionId?: string;
  requestId?: string;
  uuid?: string;
  timestamp?: string | number;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

export class ClaudeWatcher implements vscode.Disposable {
  private handlers: Handler[] = [];
  private filePositions = new Map<string, number>();
  private processedKeys = new Set<string>();
  private lastRequestBySession = new Map<string, string>();
  private fsWatchers: fs.FSWatcher[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private knownFiles = new Set<string>();
  private globalState: vscode.Memento | undefined;
  private readonly searchRoots: string[];

  private static readonly KEY = 'tokguess.claude.state';

  constructor(customPath?: string) {
    const home = os.homedir();
    this.searchRoots = customPath?.trim()
      ? [customPath.trim()]
      : [
          path.join(home, '.claude', 'projects'),
          path.join(home, '.config', 'claude')
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
    this.lastRequestBySession.clear();
    this.knownFiles.clear();
    for (const w of this.fsWatchers) {
      w.close();
    }
    this.fsWatchers = [];
    if (this.globalState) {
      void this.globalState.update(ClaudeWatcher.KEY, { ids: [], pos: {} });
    }
    this.discover();
  }

  private loadState(): void {
    if (!this.globalState) {
      return;
    }
    const s = this.globalState.get<{ ids: string[]; pos: Record<string, number> }>(
      ClaudeWatcher.KEY,
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
    void this.globalState.update(ClaudeWatcher.KEY, {
      ids: [...this.processedKeys].slice(-5000),
      pos
    });
  }

  private discover(): void {
    for (const root of this.searchRoots) {
      if (!fs.existsSync(root)) {
        continue;
      }
      this.walkJsonl(root);
    }
  }

  private walkJsonl(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkJsonl(full);
        continue;
      }
      if (!entry.name.endsWith('.jsonl')) {
        continue;
      }
      if (this.knownFiles.has(full)) {
        this.tail(full);
        continue;
      }
      this.knownFiles.add(full);
      this.tail(full);
      try {
        const watcher = fs.watch(full, () => this.tail(full));
        this.fsWatchers.push(watcher);
      } catch {
        /* ignore */
      }
    }
  }

  private tail(filePath: string): void {
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
        if (!line.includes('"assistant"') || !line.includes('"usage"')) {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as ClaudeLine;
          this.process(parsed);
        } catch {
          /* skip */
        }
      }
      this.saveState();
    } catch {
      /* ignore */
    }
  }

  private process(line: ClaudeLine): void {
    if (line.type !== 'assistant' || !line.message?.usage) {
      return;
    }
    const model = line.message.model ?? '';
    if (!model || model.startsWith('<')) {
      return;
    }

    const sessionId = line.sessionId ?? 'claude';
    const requestId = line.requestId ?? line.uuid ?? String(line.timestamp);
    const dedup = `claude:${sessionId}:${requestId}`;

    const prevRequest = this.lastRequestBySession.get(sessionId);
    const isRevision = prevRequest === requestId;

    if (!isRevision && this.processedKeys.has(dedup)) {
      return;
    }
    if (!isRevision) {
      this.processedKeys.add(dedup);
    }
    this.lastRequestBySession.set(sessionId, requestId);

    const usage = line.message.usage;
    this.emit({
      id: dedup,
      replace: isRevision,
      timestamp: line.timestamp ? new Date(line.timestamp).getTime() : Date.now(),
      source: 'claude',
      type: 'message',
      model,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      premiumRequests: 0,
      sessionId,
      estimated: false
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
