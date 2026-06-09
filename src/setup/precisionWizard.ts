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
        'Plus de précision est réservé à GitHub Copilot. Active Copilot dans les settings TokGuess.'
      );
      return false;
    }

    const step1 = await vscode.window.showInformationMessage(
      'TokGuess — Plus de précision (1/3)\n\nTokGuess va activer la télémétrie VS Code pour lire les vrais tokens Copilot. Tout reste sur localhost.',
      { modal: true },
      'Continuer'
    );
    if (step1 !== 'Continuer') {
      return false;
    }

    try {
      await this.collector.start();
      const otlp = `http://127.0.0.1:${this.collector.getOtlpPort()}/v1/traces`;
      await this.settings.inject(otlp);
      this.precision.setCollectorRunning(
        true,
        this.collector.getOtlpPort(),
        this.collector.getApiPort()
      );
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Impossible de démarrer le collecteur local: ${e instanceof Error ? e.message : 'erreur'}`
      );
      return false;
    }

    const step2 = await vscode.window.showInformationMessage(
      `TokGuess — Plus de précision (2/3)\n\nCollecteur local actif sur 127.0.0.1:${this.collector.getOtlpPort()}.\nAucune donnée ne quitte ta machine.`,
      { modal: true },
      'Vérifier'
    );
    if (step2 !== 'Vérifier') {
      await this.collector.stop();
      await this.settings.revert();
      return false;
    }

    const healthy = await this.healthCheck();
    const step3 = await vscode.window.showInformationMessage(
      healthy
        ? 'TokGuess — Plus de précision (3/3)\n\n✅ Collecteur connecté. Utilise Copilot puis Reload Window pour finaliser.'
        : 'TokGuess — Plus de précision (3/3)\n\n⚠️ Collecteur prêt mais pas encore de traces. Reload Window, puis utilise Copilot.',
      { modal: true },
      'Reload Window',
      'Plus tard'
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
    void vscode.window.showInformationMessage('TokGuess: mode standard restauré (estimation Chat.log).');
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
