import * as vscode from 'vscode';

const BACKUP_KEY = 'tokguess.precision.settingsBackup';

interface SettingSpec {
  key: string;
  value: unknown;
}

export interface InjectResult {
  applied: string[];
  skipped: string[];
}

export class CopilotSettingsManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Try to enable telemetry-related settings. Unregistered keys (depends on
   * VS Code / Copilot version) are skipped silently — the collector works
   * regardless; these settings only improve the chance VS Code emits OTel.
   */
  async inject(otlpEndpoint: string): Promise<InjectResult> {
    const specs: SettingSpec[] = [
      { key: 'telemetry.telemetryLevel', value: 'all' },
      { key: 'telemetry.enableTelemetry', value: true },
      { key: 'github.copilot.chat.logging', value: true },
      { key: 'opentelemetry.exporter.otlp.endpoint', value: otlpEndpoint }
    ];

    const config = vscode.workspace.getConfiguration();
    const backup: Record<string, unknown> =
      this.context.globalState.get(BACKUP_KEY, {}) ?? {};
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const spec of specs) {
      try {
        if (!(spec.key in backup)) {
          backup[spec.key] = config.get(spec.key);
        }
        await config.update(spec.key, spec.value, vscode.ConfigurationTarget.Global);
        applied.push(spec.key);
      } catch {
        // Not a registered configuration in this VS Code version — skip.
        delete backup[spec.key];
        skipped.push(spec.key);
      }
    }

    await this.context.globalState.update(BACKUP_KEY, backup);
    return { applied, skipped };
  }

  async revert(): Promise<void> {
    const backup = this.context.globalState.get<Record<string, unknown>>(BACKUP_KEY);
    if (!backup) {
      return;
    }

    const config = vscode.workspace.getConfiguration();
    for (const [key, val] of Object.entries(backup)) {
      try {
        await config.update(
          key,
          val === null ? undefined : val,
          vscode.ConfigurationTarget.Global
        );
      } catch {
        /* key no longer registered — nothing to revert */
      }
    }

    await this.context.globalState.update(BACKUP_KEY, undefined);
  }
}
