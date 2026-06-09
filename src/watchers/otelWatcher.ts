import * as http from 'http';
import * as vscode from 'vscode';
import { CopilotSpanRecord } from '../collector/spanParser';
import { PrecisionModeController } from '../precision/precisionMode';
import { TokenEvent } from '../types';

type Handler = (event: TokenEvent) => void;

export class OtelWatcher implements vscode.Disposable {
  private handlers: Handler[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private fallbackTimer: ReturnType<typeof setInterval> | undefined;
  private processedIds = new Set<string>();
  private apiPort = 4319;
  private lastPollAt = 0;

  activate(context: vscode.ExtensionContext): void {
    const saved = new Set(context.globalState.get<string[]>('tokguess.otel.ids', []));
    this.processedIds = saved;
  }

  onEvent(handler: Handler): void {
    this.handlers.push(handler);
  }

  setApiPort(port: number): void {
    this.apiPort = port;
  }

  startPolling(precision: PrecisionModeController): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.poll(precision);
    }, 3000);
    this.fallbackTimer = setInterval(() => {
      const config = vscode.workspace.getConfiguration('tokguess');
      const auto = config.get<boolean>('precision.autoFallback', true);
      const timeout = 5 * 60 * 1000;
      if (precision.checkFallback(auto, timeout)) {
        void vscode.window.showWarningMessage(
          'TokGuess: OTel is silent — falling back to estimated mode (Chat.log).'
        );
      }
    }, 30_000);
    void this.poll(precision);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = undefined;
    }
  }

  private async poll(precision: PrecisionModeController): Promise<void> {
    if (!precision.getState().enabled) {
      return;
    }

    try {
      const since = this.lastPollAt || Date.now() - 24 * 60 * 60 * 1000;
      const spans = await this.fetchSpans(since);
      if (spans.length) {
        precision.markOtelIngest();
      }
      for (const span of spans) {
        if (this.processedIds.has(span.id)) {
          continue;
        }
        this.processedIds.add(span.id);
        const event = spanToEvent(span);
        for (const h of this.handlers) {
          h(event);
        }
      }
      this.lastPollAt = Date.now();
      if (this.processedIds.size > 8000) {
        const arr = [...this.processedIds].slice(-4000);
        this.processedIds = new Set(arr);
      }
    } catch {
      /* collector not ready */
    }
  }

  private fetchSpans(since: number): Promise<CopilotSpanRecord[]> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${this.apiPort}/api/spans?since=${since}`,
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                spans?: CopilotSpanRecord[];
              };
              resolve(body.spans ?? []);
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(2000, () => {
        req.destroy();
        reject(new Error('timeout'));
      });
    });
  }

  dispose(): void {
    this.stopPolling();
  }
}

function spanToEvent(span: CopilotSpanRecord): TokenEvent {
  const label = span.agentMode ? `otel-${span.agentMode}` : `otel-${span.spanId}`;
  return {
    id: span.id,
    timestamp: span.timestamp,
    source: 'copilot',
    type: 'message',
    model: span.model ?? 'copilot',
    inputTokens: span.inputTokens,
    outputTokens: span.outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    premiumRequests: 0,
    sessionId: span.sessionId ?? label,
    estimated: false,
    replace: true
  };
}
