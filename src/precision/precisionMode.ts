import * as vscode from 'vscode';

export type PrecisionStatus = 'off' | 'otel' | 'fallback';

export interface PrecisionState {
  status: PrecisionStatus;
  enabled: boolean;
  fallback: boolean;
  lastOtelAt: number | null;
  collectorRunning: boolean;
  otlpPort: number;
  apiPort: number;
}

const STORAGE_KEY = 'tokguess.precision.enabled';

export class PrecisionModeController {
  private state: PrecisionState = {
    status: 'off',
    enabled: false,
    fallback: false,
    lastOtelAt: null,
    collectorRunning: false,
    otlpPort: 4318,
    apiPort: 4319
  };

  constructor(private readonly context: vscode.ExtensionContext) {
    const saved = context.globalState.get<boolean>(STORAGE_KEY, false);
    if (saved) {
      this.state.enabled = true;
      this.state.status = 'otel';
    }
  }

  getState(): PrecisionState {
    return { ...this.state };
  }

  isActive(): boolean {
    return this.state.enabled && this.state.status === 'otel' && !this.state.fallback;
  }

  shouldSkipEstimatedCopilot(): boolean {
    return this.isActive();
  }

  async enable(): Promise<void> {
    this.state.enabled = true;
    this.state.fallback = false;
    this.state.status = 'otel';
    await this.context.globalState.update(STORAGE_KEY, true);
  }

  async disable(): Promise<void> {
    this.state.enabled = false;
    this.state.fallback = false;
    this.state.status = 'off';
    this.state.collectorRunning = false;
    await this.context.globalState.update(STORAGE_KEY, false);
  }

  setCollectorRunning(running: boolean, otlpPort: number, apiPort: number): void {
    this.state.collectorRunning = running;
    this.state.otlpPort = otlpPort;
    this.state.apiPort = apiPort;
  }

  markOtelIngest(): void {
    this.state.lastOtelAt = Date.now();
    if (this.state.fallback) {
      this.state.fallback = false;
      this.state.status = 'otel';
    }
  }

  checkFallback(autoFallback: boolean, timeoutMs: number): boolean {
    if (!this.state.enabled || !autoFallback) {
      return false;
    }
    if (!this.state.lastOtelAt) {
      return false;
    }
    const silent = Date.now() - this.state.lastOtelAt > timeoutMs;
    if (silent && !this.state.fallback) {
      this.state.fallback = true;
      this.state.status = 'fallback';
      return true;
    }
    return this.state.fallback;
  }
}
