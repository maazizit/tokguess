import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TokenEvent } from '../types';

type Handler = (event: TokenEvent) => void;

interface SessionEvent {
  type?: string;
  id?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

export class CopilotWatcher implements vscode.Disposable {
  private readonly basePath: string;
  private handlers: Handler[] = [];
  private filePositions = new Map<string, number>();
  private processedIds = new Set<string>();
  private fsWatchers: fs.FSWatcher[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private knownDirs = new Set<string>();
  private globalState: vscode.Memento | undefined;

  private static readonly KEY_IDS = 'tokguess.copilot.ids';
  private static readonly KEY_POS = 'tokguess.copilot.pos';

  constructor(customPath?: string) {
    this.basePath =
      customPath?.trim() || path.join(os.homedir(), '.copilot', 'session-state');
  }

  get path(): string {
    return this.basePath;
  }

  isActive(): boolean {
    return fs.existsSync(this.basePath);
  }

  onEvent(handler: Handler): void {
    this.handlers.push(handler);
  }

  activate(context: vscode.ExtensionContext): void {
    this.globalState = context.globalState;
    this.loadState();

    if (!this.isActive()) {
      return;
    }

    this.scan();
    this.pollTimer = setInterval(() => this.scan(), 30_000);
  }

  rescan(): void {
    this.filePositions.clear();
    this.processedIds.clear();
    this.knownDirs.clear();
    for (const w of this.fsWatchers) {
      w.close();
    }
    this.fsWatchers = [];
    if (this.globalState) {
      void this.globalState.update(CopilotWatcher.KEY_IDS, []);
      void this.globalState.update(CopilotWatcher.KEY_POS, {});
    }
    if (this.isActive()) {
      this.scan();
    }
  }

  private loadState(): void {
    if (!this.globalState) {
      return;
    }
    for (const id of this.globalState.get<string[]>(CopilotWatcher.KEY_IDS, [])) {
      this.processedIds.add(id);
    }
    const pos = this.globalState.get<Record<string, number>>(CopilotWatcher.KEY_POS, {});
    for (const [k, v] of Object.entries(pos)) {
      this.filePositions.set(k, v);
    }
  }

  private saveState(): void {
    if (!this.globalState) {
      return;
    }
    void this.globalState.update(CopilotWatcher.KEY_IDS, [...this.processedIds].slice(-5000));
    const pos: Record<string, number> = {};
    for (const [k, v] of this.filePositions) {
      pos[k] = v;
    }
    void this.globalState.update(CopilotWatcher.KEY_POS, pos);
  }

  private scan(): void {
    try {
      for (const entry of fs.readdirSync(this.basePath, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const dir = path.join(this.basePath, entry.name);
        if (this.knownDirs.has(dir)) {
          continue;
        }
        const eventsFile = path.join(dir, 'events.jsonl');
        if (!fs.existsSync(eventsFile)) {
          continue;
        }
        this.knownDirs.add(dir);
        this.tail(eventsFile, entry.name);
        try {
          const watcher = fs.watch(eventsFile, () => this.tail(eventsFile, entry.name));
          this.fsWatchers.push(watcher);
        } catch {
          /* ignore watch errors */
        }
      }
    } catch {
      /* ignore scan errors */
    }
  }

  private tail(filePath: string, sessionId: string): void {
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
          const raw = JSON.parse(line) as SessionEvent;
          this.process(raw, sessionId);
        } catch {
          /* skip bad lines */
        }
      }
      this.saveState();
    } catch {
      /* ignore read errors */
    }
  }

  private process(event: SessionEvent, sessionId: string): void {
    if (event.id) {
      if (this.processedIds.has(event.id)) {
        return;
      }
      this.processedIds.add(event.id);
    }

    // assistant.message = live output only (ephemeral, not stored — avoids double-count with shutdown)
    if (event.type === 'assistant.message') {
      const data = event.data ?? {};
      const output = Number(data.outputTokens ?? 0);
      if (output > 0) {
        this.emit({
          id: `live:${event.id ?? `${sessionId}-${event.timestamp}`}`,
          timestamp: new Date(event.timestamp ?? Date.now()).getTime(),
          source: 'copilot',
          type: 'message',
          outputTokens: output,
          inputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          premiumRequests: 0,
          sessionId,
          estimated: false,
          liveOnly: true
        });
      }
      return;
    }

    if (event.type === 'session.shutdown') {
      const data = event.data ?? {};
      const premium = Number(data.totalPremiumRequests ?? 0);
      if (premium <= 0) {
        return;
      }
      const metrics = data.modelMetrics as Record<
        string,
        {
          usage?: {
            inputTokens?: number;
            outputTokens?: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
          };
          requests?: { cost?: number };
        }
      >;
      if (!metrics) {
        return;
      }
      for (const [model, m] of Object.entries(metrics)) {
        const usage = m.usage ?? {};
        this.emit({
          id: `${event.id ?? sessionId}-${model}`,
          timestamp: new Date(event.timestamp ?? Date.now()).getTime(),
          source: 'copilot',
          type: 'session-summary',
          model,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cacheReadTokens: usage.cacheReadTokens ?? 0,
          cacheWriteTokens: usage.cacheWriteTokens ?? 0,
          premiumRequests: m.requests?.cost ?? 0,
          sessionId,
          estimated: false
        });
      }
    }
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
