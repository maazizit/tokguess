import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TokenEvent } from '../types';

type Handler = (event: TokenEvent) => void;

export interface CopilotLogEntry {
  timestamp: number;
  requestId: string;
  status: 'success' | 'error' | 'unknown';
  model: string;
  durationMs: number;
  context: string;
}

const CCREQ_PATTERN =
  /ccreq:([a-f0-9]+)\.copilotmd\s*\|\s*(success|error)\s*\|\s*([^|]+?)\s*\|\s*(\d+)ms\s*\|\s*\[([^\]]+)\]/;

// Real-world token generation rates (tokens/sec output) + network latency
const MODEL_OUTPUT_RATES: Record<string, { rate: number; latency: number }> = {
  'gpt-4o-mini': { rate: 165, latency: 150 },
  'gpt-4o': { rate: 110, latency: 180 },
  'claude-sonnet-4.5': { rate: 120, latency: 220 },
  'claude-sonnet-3.5': { rate: 110, latency: 200 },
  'claude-sonnet': { rate: 110, latency: 200 },
  'claude-opus': { rate: 70, latency: 300 },
  'claude-haiku': { rate: 200, latency: 120 },
  default: { rate: 100, latency: 200 }
};

// Context-aware estimation profiles (based on Copilot request types)
interface ContextProfile {
  baseInput: number;    // Minimum input tokens for this context
  inputRatio: number;   // Typical input:output ratio
  overhead: number;     // Additional processing overhead (ms)
}

const CONTEXT_PROFILES: Record<string, ContextProfile> = {
  'panel/editAgent': { baseInput: 4000, inputRatio: 10, overhead: 300 },
  'panel/chat': { baseInput: 2000, inputRatio: 5, overhead: 200 },
  'copilotLanguageModelWrapper': { baseInput: 1000, inputRatio: 12, overhead: 150 },
  'workspace/command': { baseInput: 2500, inputRatio: 7, overhead: 250 },
  default: { baseInput: 1500, inputRatio: 8, overhead: 200 }
};

export function parseCcreqLine(line: string): CopilotLogEntry | null {
  const match = line.match(CCREQ_PATTERN);
  if (!match) {
    return null;
  }

  const [, requestId, status, modelStr, durationStr, context] = match;
  const model = modelStr.includes('->') ? modelStr.split('->')[0].trim() : modelStr.trim();
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
  if (!timestampMatch) {
    return null;
  }
  const timestamp = new Date(timestampMatch[1]).getTime();

  return {
    timestamp,
    requestId,
    status: status as 'success' | 'error',
    model,
    durationMs: parseInt(durationStr, 10),
    context
  };
}

function estimateFromDuration(
  model: string,
  durationMs: number,
  context: string
): { input: number; output: number } {
  // 1. Detect context profile
  const profile = CONTEXT_PROFILES[context] || CONTEXT_PROFILES.default;

  // 2. Detect model config
  const normalized = model.toLowerCase();
  let config = MODEL_OUTPUT_RATES.default;
  for (const [key, conf] of Object.entries(MODEL_OUTPUT_RATES)) {
    if (key !== 'default' && normalized.includes(key)) {
      config = conf;
      break;
    }
  }

  // 3. Calculate effective generation time (subtract latency + overhead)
  const generationTime = Math.max(durationMs - config.latency - profile.overhead, 100);

  // 4. Estimate output tokens from generation time
  const output = Math.ceil((generationTime / 1000) * config.rate);

  // 5. Estimate input based on context profile and output
  const input = Math.max(
    profile.baseInput,
    Math.ceil(output * profile.inputRatio)
  );

  return { input, output };
}

export class CopilotLogWatcher implements vscode.Disposable {
  private handlers: Handler[] = [];
  private filePositions = new Map<string, number>();
  private processedIds = new Set<string>();
  private fsWatchers: fs.FSWatcher[] = [];
  private watchedFiles = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private globalState: vscode.Memento | undefined;
  private readonly logsBasePath: string;

  private static readonly KEY_IDS = 'tokguess.copilotlog.ids';
  private static readonly KEY_POS = 'tokguess.copilotlog.pos';

  constructor(customPath?: string) {
    if (customPath?.trim()) {
      this.logsBasePath = customPath.trim();
    } else if (process.platform === 'darwin') {
      this.logsBasePath = path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Code',
        'logs'
      );
    } else if (process.platform === 'win32') {
      this.logsBasePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'logs');
    } else {
      this.logsBasePath = path.join(os.homedir(), '.config', 'Code', 'logs');
    }
  }

  get path(): string {
    return this.logsBasePath;
  }

  isActive(): boolean {
    return fs.existsSync(this.logsBasePath);
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
    this.pollTimer = setInterval(() => this.scan(), 60_000);
  }

  rescan(): void {
    this.filePositions.clear();
    this.processedIds.clear();
    this.watchedFiles.clear();
    for (const w of this.fsWatchers) {
      w.close();
    }
    this.fsWatchers = [];
    if (this.globalState) {
      void this.globalState.update(CopilotLogWatcher.KEY_IDS, []);
      void this.globalState.update(CopilotLogWatcher.KEY_POS, {});
    }
    if (this.isActive()) {
      this.scan();
    }
  }

  private loadState(): void {
    if (!this.globalState) {
      return;
    }
    for (const id of this.globalState.get<string[]>(CopilotLogWatcher.KEY_IDS, [])) {
      this.processedIds.add(id);
    }
    const pos = this.globalState.get<Record<string, number>>(CopilotLogWatcher.KEY_POS, {});
    for (const [k, v] of Object.entries(pos)) {
      this.filePositions.set(k, v);
    }
  }

  private saveState(): void {
    if (!this.globalState) {
      return;
    }
    void this.globalState.update(CopilotLogWatcher.KEY_IDS, [...this.processedIds].slice(-5000));
    const pos: Record<string, number> = {};
    for (const [k, v] of this.filePositions) {
      pos[k] = v;
    }
    void this.globalState.update(CopilotLogWatcher.KEY_POS, pos);
  }

  private scan(): void {
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const sessionDirs = fs
        .readdirSync(this.logsBasePath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name));

      for (const sessionDir of sessionDirs) {
        const sessionPath = path.join(this.logsBasePath, sessionDir.name);
        let windowDirs: fs.Dirent[];
        try {
          windowDirs = fs
            .readdirSync(sessionPath, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name.startsWith('window'));
        } catch {
          continue;
        }

        for (const windowDir of windowDirs) {
          const logFile = path.join(
            sessionPath,
            windowDir.name,
            'exthost',
            'GitHub.copilot-chat',
            'GitHub Copilot Chat.log'
          );
          if (this.watchedFiles.has(logFile)) {
            this.tail(logFile);
            continue;
          }
          try {
            const stat = fs.statSync(logFile);
            if (stat.mtimeMs < sevenDaysAgo) {
              continue;
            }
          } catch {
            continue;
          }
          this.watchedFiles.add(logFile);
          this.tail(logFile);
          try {
            const watcher = fs.watch(logFile, () => this.tail(logFile));
            this.fsWatchers.push(watcher);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
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
        if (!line.includes('ccreq:')) {
          continue;
        }
        const entry = parseCcreqLine(line);
        if (!entry || entry.status !== 'success') {
          continue;
        }
        if (this.processedIds.has(entry.requestId)) {
          continue;
        }
        this.processedIds.add(entry.requestId);

        if (this.isTodayOnly() && !this.isToday(entry.timestamp)) {
          continue;
        }

        const est = estimateFromDuration(entry.model, entry.durationMs, entry.context);
        this.emit({
          id: `copilot-log:${entry.requestId}`,
          timestamp: entry.timestamp,
          source: 'copilot',
          type: 'message',
          model: entry.model,
          inputTokens: est.input,
          outputTokens: est.output,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          premiumRequests: 0,
          sessionId: `log-${entry.context}`,
          estimated: true
        });
      }
      this.saveState();
    } catch {
      /* ignore */
    }
  }

  private isTodayOnly(): boolean {
    return vscode.workspace
      .getConfiguration('tokguess')
      .get<boolean>('sources.copilot.logTodayOnly', true);
  }

  private isToday(ts: number): boolean {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return ts >= start;
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
