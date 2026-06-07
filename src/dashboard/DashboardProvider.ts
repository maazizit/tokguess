import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getContextBudgetSnapshot } from '../contextBudget';
import { UsageStore } from '../storage/usageStore';
import { CopilotLogWatcher } from '../watchers/copilotLogWatcher';
import { CopilotWatcher } from '../watchers/copilotWatcher';
import { ClaudeWatcher } from '../watchers/claudeWatcher';

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tokguess.dashboard';
  private view?: vscode.WebviewView;
  private period: 'today' | 'week' | 'month' = 'today';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: UsageStore,
    private readonly copilot: CopilotWatcher,
    private readonly copilotLog: CopilotLogWatcher,
    private readonly claude: ClaudeWatcher,
    private readonly getFileEstimate: () => number
  ) {
    store.onChange(() => this.push());
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'dashboard.html');
    webviewView.webview.html = fs.readFileSync(htmlPath, 'utf8');

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'ready' || msg.type === 'refresh') {
        this.push();
      }
      if (msg.type === 'setPeriod' && ['today', 'week', 'month'].includes(msg.period)) {
        this.period = msg.period;
        this.push();
      }
    });
  }

  openPanel(): void {
    if (this.view) {
      this.view.show?.(true);
      this.push();
      return;
    }
    void vscode.commands.executeCommand('workbench.view.extension.tokguess');
  }

  push(): void {
    if (!this.view?.webview) {
      return;
    }
    const config = vscode.workspace.getConfiguration('tokguess');
    const budget = getContextBudgetSnapshot();
    const payload = this.store.buildDashboard(this.period, budget.fileTokens, {
      copilot: {
        enabled: config.get<boolean>('sources.copilot.enabled', true),
        path: this.copilot.isActive()
          ? this.copilot.path
          : this.copilotLog.path + ' (Chat.log)',
        active: this.copilot.isActive() || this.copilotLog.isActive()
      },
      claude: {
        enabled: config.get<boolean>('sources.claude.enabled', true),
        path: this.claude.paths.join(', '),
        active: this.claude.isActive()
      }
    });
    payload.contextBudget = {
      fileTokens: budget.fileTokens,
      selectionTokens: budget.selectionTokens,
      contextTokens: budget.contextTokens,
      threshold: budget.threshold,
      percent: budget.percent,
      level: budget.level,
      hasSelection: budget.hasSelection,
      fileName: budget.fileName
    };
    this.view.webview.postMessage({ type: 'dashboard', payload });
  }
}
