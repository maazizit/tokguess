import * as vscode from 'vscode';
import { ContextBudgetSnapshot, getContextBudgetSnapshot } from './contextBudget';
import { formatCost, formatTokens } from './pricing';
import { UsageStore } from './storage/usageStore';

export class StatusBarController implements vscode.Disposable {
  private usageItem: vscode.StatusBarItem;
  private budgetItem: vscode.StatusBarItem;
  private enabled = true;
  private budgetSnap: ContextBudgetSnapshot = getContextBudgetSnapshot();

  constructor(private readonly store: UsageStore) {
    this.usageItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    this.usageItem.command = 'tokguess.openPanel';

    this.budgetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.budgetItem.command = 'tokguess.checkBudget';

    this.usageItem.show();
    this.budgetItem.show();
    store.onChange(() => this.refresh());
  }

  updateBudget(snap: ContextBudgetSnapshot): void {
    this.budgetSnap = snap;
    this.renderBudget();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.refresh();
  }

  refresh(): void {
    if (!this.enabled) {
      this.usageItem.text = '🤖 TokGuess: off';
      this.budgetItem.hide();
      return;
    }

    this.budgetItem.show();
    this.renderBudget();

    const dash = this.store.buildDashboard('today', this.budgetSnap.fileTokens, {
      copilot: { enabled: true, path: '', active: false },
      claude: { enabled: true, path: '', active: false }
    });

    const total = dash.today.totalTokens + dash.liveCopilotOutput;
    const cost = dash.today.cost;

    if (total > 0) {
      this.usageItem.text = `🤖 ${formatTokens(total)} · ${formatCost(cost)}`;
      this.usageItem.tooltip = `TokGuess today\n${total.toLocaleString()} tokens · ${formatCost(cost)}\nClick for dashboard`;
    } else {
      this.usageItem.text = '🤖 TokGuess';
      this.usageItem.tooltip = 'TokGuess — session usage today\nClick for dashboard';
    }
  }

  private renderBudget(): void {
    const s = this.budgetSnap;
    if (!s.enabled || s.level === 'idle') {
      this.budgetItem.hide();
      return;
    }

    this.budgetItem.show();
    const icon = s.level === 'over' ? '🔴' : s.level === 'warn' ? '🟡' : '📋';
    this.budgetItem.text = `${icon} ~${formatTokens(s.contextTokens)}/${formatTokens(s.threshold)}`;
    this.budgetItem.backgroundColor =
      s.level === 'over'
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : s.level === 'warn'
          ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;

    const selLine = s.hasSelection
      ? `Selection: ~${s.selectionTokens.toLocaleString()} tok\nFile: ~${s.fileTokens.toLocaleString()} tok`
      : `File: ~${s.fileTokens.toLocaleString()} tok (no selection)`;

    this.budgetItem.tooltip =
      `Context Budget — ${s.fileName}\n` +
      `Send estimate: ~${s.contextTokens.toLocaleString()} / ${s.threshold.toLocaleString()} tok (${s.percent}%)\n` +
      `${selLine}\n` +
      `Click for details`;
  }

  dispose(): void {
    this.usageItem.dispose();
    this.budgetItem.dispose();
  }
}
