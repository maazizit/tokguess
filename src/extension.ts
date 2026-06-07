import * as vscode from 'vscode';
import { ContextBudgetAlerts } from './contextBudget';
import { DashboardProvider } from './dashboard/DashboardProvider';
import { estimateTokensFromText } from './estimator';
import { StatusBarController } from './statusBar';
import { UsageStore } from './storage/usageStore';
import { ClaudeWatcher } from './watchers/claudeWatcher';
import { CopilotLogWatcher } from './watchers/copilotLogWatcher';
import { CopilotWatcher } from './watchers/copilotWatcher';

let store: UsageStore;
let statusBar: StatusBarController;
let dashboard: DashboardProvider;
let budgetAlerts: ContextBudgetAlerts;
let copilotWatcher: CopilotWatcher;
let copilotLogWatcher: CopilotLogWatcher;
let claudeWatcher: ClaudeWatcher;
let enabled = true;

function getFileEstimate(): number {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return 0;
  }
  return estimateTokensFromText(editor.document.getText());
}

function refreshUi(): void {
  const snap = budgetAlerts.check();
  statusBar?.updateBudget(snap);
  statusBar?.refresh();
  dashboard?.push();
}

export function activate(context: vscode.ExtensionContext): void {
  const config = () => vscode.workspace.getConfiguration('tokguess');

  store = new UsageStore(context);
  budgetAlerts = new ContextBudgetAlerts();
  copilotWatcher = new CopilotWatcher(config().get('sources.copilot.path'));
  copilotLogWatcher = new CopilotLogWatcher(config().get('sources.copilot.logPath'));
  claudeWatcher = new ClaudeWatcher(config().get('sources.claude.path'));

  statusBar = new StatusBarController(store);
  dashboard = new DashboardProvider(
    context.extensionUri,
    store,
    copilotWatcher,
    copilotLogWatcher,
    claudeWatcher,
    getFileEstimate
  );

  const ingest = (event: Parameters<UsageStore['add']>[0]) => {
    if (!enabled) {
      return;
    }
    store.add(event);
    refreshUi();
  };

  if (config().get('sources.copilot.enabled', true)) {
    copilotWatcher.onEvent(ingest);
    copilotWatcher.activate(context);
    if (config().get('sources.copilot.logWatcher', true)) {
      copilotLogWatcher.onEvent(ingest);
      copilotLogWatcher.activate(context);
    }
  }

  if (config().get('sources.claude.enabled', true)) {
    claudeWatcher.onEvent(ingest);
    claudeWatcher.activate(context);
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, dashboard),
    vscode.commands.registerCommand('tokguess.openPanel', () => dashboard.openPanel()),
    vscode.commands.registerCommand('tokguess.checkBudget', () => budgetAlerts.showCheck()),
    vscode.commands.registerCommand('tokguess.rescan', async () => {
      await store.rescan();
      copilotWatcher.rescan();
      copilotLogWatcher.rescan();
      claudeWatcher.rescan();
      refreshUi();
      void vscode.window.showInformationMessage('TokGuess: logs rescanned');
    }),
    vscode.commands.registerCommand('tokguess.countCurrentFile', () => {
      void budgetAlerts.showCheck();
    }),
    vscode.commands.registerCommand('tokguess.showStats', () => dashboard.openPanel()),
    vscode.commands.registerCommand('tokguess.toggle', () => {
      enabled = !enabled;
      budgetAlerts.setEnabled(enabled);
      statusBar.setEnabled(enabled);
      void vscode.window.showInformationMessage(`TokGuess ${enabled ? 'enabled' : 'disabled'}`);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tokguess.budget')) {
        refreshUi();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => refreshUi()),
    vscode.window.onDidChangeTextEditorSelection(() => refreshUi()),
    vscode.workspace.onDidChangeTextDocument(() => refreshUi()),
    budgetAlerts,
    copilotWatcher,
    claudeWatcher,
    statusBar
  );

  refreshUi();
}

export function deactivate(): void {
  copilotWatcher?.dispose();
  copilotLogWatcher?.dispose();
  claudeWatcher?.dispose();
  budgetAlerts?.dispose();
  statusBar?.dispose();
}
