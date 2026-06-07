import * as vscode from 'vscode';
import { estimateTokensFromText } from './estimator';
import { formatTokens } from './pricing';

export type BudgetLevel = 'ok' | 'warn' | 'over' | 'idle';

export interface ContextBudgetSnapshot {
  fileTokens: number;
  selectionTokens: number;
  contextTokens: number;
  threshold: number;
  warnAt: number;
  warnPercent: number;
  percent: number;
  level: BudgetLevel;
  fileName: string;
  hasSelection: boolean;
  enabled: boolean;
}

export function getContextBudgetSnapshot(): ContextBudgetSnapshot {
  const config = vscode.workspace.getConfiguration('tokguess');
  const enabled = config.get<boolean>('budget.enabled', true);
  const threshold = config.get<number>('budget.threshold', 32_000);
  const warnPercent = config.get<number>('budget.warnPercent', 75);
  const warnAt = Math.floor(threshold * (warnPercent / 100));

  const editor = vscode.window.activeTextEditor;
  if (!editor || !enabled) {
    return {
      fileTokens: 0,
      selectionTokens: 0,
      contextTokens: 0,
      threshold,
      warnAt,
      warnPercent,
      percent: 0,
      level: 'idle',
      fileName: '',
      hasSelection: false,
      enabled
    };
  }

  const fileText = editor.document.getText();
  const selectionText = editor.document.getText(editor.selection);
  const fileTokens = estimateTokensFromText(fileText);
  const hasSelection = !editor.selection.isEmpty;
  const selectionTokens = hasSelection ? estimateTokensFromText(selectionText) : 0;
  const contextTokens = hasSelection ? fileTokens + selectionTokens : fileTokens;
  const percent = threshold > 0 ? Math.round((contextTokens / threshold) * 100) : 0;

  let level: BudgetLevel = 'ok';
  if (contextTokens >= threshold) {
    level = 'over';
  } else if (contextTokens >= warnAt) {
    level = 'warn';
  }

  const fileName = editor.document.fileName.split('/').pop() ?? 'untitled';

  return {
    fileTokens,
    selectionTokens,
    contextTokens,
    threshold,
    warnAt,
    warnPercent,
    percent,
    level,
    fileName,
    hasSelection,
    enabled
  };
}

export function formatBudgetMessage(s: ContextBudgetSnapshot): string {
  if (s.level === 'idle') {
    return 'No active editor — open a file to check context budget.';
  }

  const parts = [
    `📋 Context Budget — ${s.fileName}`,
    '',
    `Estimated send context: ~${s.contextTokens.toLocaleString()} tokens`,
    `  • File: ~${s.fileTokens.toLocaleString()} tok`,
    s.hasSelection
      ? `  • Selection: ~${s.selectionTokens.toLocaleString()} tok`
      : '  • Selection: (none — using full file)',
    '',
    `Threshold: ${s.threshold.toLocaleString()} tok (${s.percent}% used)`,
    `Warning at: ${s.warnAt.toLocaleString()} tok (${s.warnPercent}%)`,
    '',
    s.level === 'over'
      ? '🔴 OVER BUDGET — trim file or selection before sending to AI.'
      : s.level === 'warn'
        ? '🟡 NEAR LIMIT — consider narrowing context.'
        : '🟢 Within budget.'
  ];

  return parts.join('\n');
}

export class ContextBudgetAlerts implements vscode.Disposable {
  private lastLevel: BudgetLevel = 'idle';
  private lastContext = 0;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private enabled = true;

  check(): ContextBudgetSnapshot {
    if (!this.enabled) {
      return getContextBudgetSnapshot();
    }

    const snap = getContextBudgetSnapshot();
    if (snap.level === 'idle' || !snap.enabled) {
      this.lastLevel = 'idle';
      return snap;
    }

    const config = vscode.workspace.getConfiguration('tokguess');
    if (!config.get<boolean>('budget.alerts', true)) {
      return snap;
    }

    const changed =
      snap.contextTokens !== this.lastContext ||
      snap.level !== this.lastLevel;

    if (!changed) {
      return snap;
    }

    if (this.debounce) {
      clearTimeout(this.debounce);
    }

    this.debounce = setTimeout(() => {
      this.maybeAlert(snap);
      this.lastContext = snap.contextTokens;
      this.lastLevel = snap.level;
    }, 800);

    return snap;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  async showCheck(): Promise<void> {
    const snap = getContextBudgetSnapshot();
    const msg = formatBudgetMessage(snap);
    if (snap.level === 'over') {
      const action = await vscode.window.showWarningMessage(msg, 'Open Dashboard');
      if (action === 'Open Dashboard') {
        void vscode.commands.executeCommand('tokguess.openPanel');
      }
      return;
    }
    if (snap.level === 'warn') {
      await vscode.window.showWarningMessage(msg);
      return;
    }
    await vscode.window.showInformationMessage(msg);
  }

  private maybeAlert(snap: ContextBudgetSnapshot): void {
    if (snap.level === 'over' && this.lastLevel !== 'over') {
      const sel = snap.hasSelection ? 'file + selection' : 'file';
      void vscode.window.showWarningMessage(
        `TokGuess: ~${formatTokens(snap.contextTokens)} tok (${sel}) exceeds ${formatTokens(snap.threshold)} budget.`,
        'Check Budget'
      ).then((action) => {
        if (action === 'Check Budget') {
          void this.showCheck();
        }
      });
      return;
    }

    if (snap.level === 'warn' && this.lastLevel === 'ok') {
      void vscode.window.showInformationMessage(
        `TokGuess: ~${formatTokens(snap.contextTokens)} tok — ${snap.percent}% of ${formatTokens(snap.threshold)} context budget.`
      );
    }
  }

  dispose(): void {
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
  }
}
