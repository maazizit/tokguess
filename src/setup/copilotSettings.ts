import * as vscode from 'vscode';

const PRECISION_KEYS = [
  'github.copilot.chat.logging',
  'telemetry.telemetryLevel',
  'telemetry.enableTelemetry'
] as const;

const BACKUP_KEY = 'tokguess.precision.settingsBackup';

export interface InjectedSettings {
  otlpEndpoint: string;
}

export class CopilotSettingsManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async inject(otlpEndpoint: string): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const backup: Record<string, unknown> =
      this.context.globalState.get(BACKUP_KEY, {}) ?? {};

    for (const key of PRECISION_KEYS) {
      if (backup[key] === undefined) {
        backup[key] = config.get(key);
      }
    }
    await this.context.globalState.update(BACKUP_KEY, backup);

    await config.update('github.copilot.chat.logging', true, vscode.ConfigurationTarget.Global);
    await config.update('telemetry.enableTelemetry', true, vscode.ConfigurationTarget.Global);
    await config.update('telemetry.telemetryLevel', 'all', vscode.ConfigurationTarget.Global);

    const otelConfig = vscode.workspace.getConfiguration('opentelemetry');
    if (backup['opentelemetry.exporter.otlp.endpoint'] === undefined) {
      backup['opentelemetry.exporter.otlp.endpoint'] = otelConfig.get('exporter.otlp.endpoint');
    }
    await otelConfig.update('exporter.otlp.endpoint', otlpEndpoint, vscode.ConfigurationTarget.Global);
    await this.context.globalState.update(BACKUP_KEY, backup);
  }

  async revert(): Promise<void> {
    const backup = this.context.globalState.get<Record<string, unknown>>(BACKUP_KEY);
    if (!backup) {
      return;
    }

    const config = vscode.workspace.getConfiguration();
    for (const key of PRECISION_KEYS) {
      if (key in backup) {
        const val = backup[key];
        if (val === undefined) {
          await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        } else {
          await config.update(key, val as string | boolean, vscode.ConfigurationTarget.Global);
        }
      }
    }

    const otelEndpoint = backup['opentelemetry.exporter.otlp.endpoint'];
    const otelConfig = vscode.workspace.getConfiguration('opentelemetry');
    if (otelEndpoint === undefined) {
      await otelConfig.update('exporter.otlp.endpoint', undefined, vscode.ConfigurationTarget.Global);
    } else {
      await otelConfig.update(
        'exporter.otlp.endpoint',
        otelEndpoint as string,
        vscode.ConfigurationTarget.Global
      );
    }

    await this.context.globalState.update(BACKUP_KEY, undefined);
  }
}
