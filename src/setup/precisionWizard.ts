import * as http from 'http';
import * as vscode from 'vscode';
import { MiniCollector } from '../collector/miniCollector';
import { PrecisionModeController } from '../precision/precisionMode';
import { CopilotOtelFileWatcher } from '../watchers/copilotOtelFileWatcher';
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
      'TokGuess — Precision Mode (1/3)\n\nTokGuess will enable Copilot Chat\'s official OpenTelemetry export (file mode) to read real token counts. No prompts or code are captured. Everything stays on your machine.',
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
    // (requires a recent Copilot Chat version), never blocks the wizard.
    const outfile = CopilotOtelFileWatcher.defaultPath();
    const result = await this.settings.inject(outfile);
    if (result.skipped.length > 0 && result.applied.length === 0) {
      void vscode.window.showWarningMessage(
        'TokGuess: your Copilot Chat version does not expose github.copilot.chat.otel.* settings. Update the GitHub Copilot Chat extension, then retry — falling back to estimation meanwhile.'
      );
    }

    const step2 = await vscode.window.showInformationMessage(
      `TokGuess — Precision Mode (2/3)\n\nCopilot will write real token spans to:\n${outfile}\n\nLocal OTLP collector also running on 127.0.0.1:${this.collector.getOtlpPort()} (for Claude Code & friends).\nNo data leaves your machine.`,
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
        ? 'TokGuess — Precision Mode (3/3)\n\n✅ Ready. Reload Window so Copilot starts exporting, then use Copilot Chat — real tokens will appear in the dashboard.'
        : 'TokGuess — Precision Mode (3/3)\n\n⚠️ Setup applied but collector not responding. Reload Window, then use Copilot.',
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
