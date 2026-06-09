import * as http from 'http';
import * as vscode from 'vscode';
import { MiniCollector } from '../collector/miniCollector';
import { PrecisionModeController } from '../precision/precisionMode';
import { CopilotSettingsManager } from './copilotSettings';

export class PrecisionWizard {
  constructor(
    private readonly collector: MiniCollector,
    private readonly precision: PrecisionModeController,
    private readonly settings: CopilotSettingsManager
  ) {}

  async run(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('tokguess');
    if (!config.get<boolean>('sources.copilot.enabled', true)) {
      void vscode.window.showWarningMessage(
        'Precision mode is GitHub Copilot only. Enable Copilot in TokGuess settings first.'
      );
      return false;
    }

    const step1 = await vscode.window.showInformationMessage(
      'TokGuess — Precision Mode (1/3)\n\nTokGuess will enable VS Code telemetry to read real Copilot token counts. Everything stays on localhost.',
      { modal: true },
      'Continue'
    );
    if (step1 !== 'Continue') {
      return false;
    }

    try {
      await this.collector.start();
      this.precision.setCollectorRunning(
        true,
        this.collector.getOtlpPort(),
        this.collector.getApiPort()
      );
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Could not start the local collector: ${e instanceof Error ? e.message : 'error'}`
      );
      return false;
    }

    // Settings injection is best-effort: unregistered keys are skipped
    // (depends on VS Code/Copilot version), never blocks the wizard.
    const otlp = `http://127.0.0.1:${this.collector.getOtlpPort()}/v1/traces`;
    const result = await this.settings.inject(otlp);
    if (result.skipped.length > 0 && result.applied.length === 0) {
      void vscode.window.showWarningMessage(
        'TokGuess: your VS Code version does not expose OTel telemetry settings. The collector is running, but Copilot may not emit traces — auto fallback to estimation.'
      );
    }

    const step2 = await vscode.window.showInformationMessage(
      `TokGuess — Precision Mode (2/3)\n\nLocal collector running on 127.0.0.1:${this.collector.getOtlpPort()}.\nNo data leaves your machine.`,
      { modal: true },
      'Verify'
    );
    if (step2 !== 'Verify') {
      await this.collector.stop();
      await this.settings.revert();
      return false;
    }

    const healthy = await this.healthCheck();
    const step3 = await vscode.window.showInformationMessage(
      healthy
        ? 'TokGuess — Precision Mode (3/3)\n\n✅ Collector connected. Use Copilot, then Reload Window to finish.'
        : 'TokGuess — Precision Mode (3/3)\n\n⚠️ Collector ready but no traces yet. Reload Window, then use Copilot.',
      { modal: true },
      'Reload Window',
      'Later'
    );

    await this.precision.enable();

    if (step3 === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }

    return true;
  }

  async disable(): Promise<void> {
    await this.collector.stop();
    await this.settings.revert();
    await this.precision.disable();
    void vscode.window.showInformationMessage('TokGuess: standard mode restored (Chat.log estimation).');
  }

  private healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${this.collector.getApiPort()}/health`,
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { ok?: boolean };
              resolve(Boolean(body.ok));
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on('error', () => resolve(false));
      req.setTimeout(1500, () => {
        req.destroy();
        resolve(false);
      });
    });
  }
}
