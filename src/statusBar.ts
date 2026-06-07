import * as vscode from 'vscode';
import { formatCost, formatTokens } from './pricing';
import { UsageStore } from './storage/usageStore';

export class StatusBarController implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private enabled = true;
  private getFileEstimate: () => number = () => 0;

  constructor(private readonly store: UsageStore) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.item.command = 'tokguess.openPanel';
    this.item.show();
    store.onChange(() => this.refresh());
  }

  bindFileEstimate(fn: () => number): void {
    this.getFileEstimate = fn;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.refresh();
  }

  refresh(): void {
    if (!this.enabled) {
      this.item.text = '🤖 TokGuess: off';
      return;
    }

    const fileEstimate = this.getFileEstimate();
    const dash = this.store.buildDashboard('today', fileEstimate, {
      copilot: { enabled: true, path: '', active: false },
      claude: { enabled: true, path: '', active: false }
    });

    const total = dash.today.totalTokens + dash.liveCopilotOutput;
    const cost = dash.today.cost;

    if (total > 0) {
      const live = dash.liveCopilotOutput > 0 ? ` (+${formatTokens(dash.liveCopilotOutput)} live)` : '';
      this.item.text = `🤖 ${formatTokens(total)} · ${formatCost(cost)}`;
      this.item.tooltip = `TokGuess today\n${total.toLocaleString()} tokens · ${formatCost(cost)}${live}\nClick for dashboard`;
    } else if (fileEstimate > 0) {
      this.item.text = `🤖 ~${formatTokens(fileEstimate)} file`;
      this.item.tooltip = 'TokGuess — file estimate only\nNo session logs yet · Click for dashboard';
    } else {
      this.item.text = '🤖 TokGuess';
      this.item.tooltip = 'TokGuess — open dashboard';
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
