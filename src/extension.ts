import * as vscode from 'vscode';
import { DashboardProvider } from './dashboard/DashboardProvider';
import { estimateTokensFromText } from './estimator';
import { StatusBarController } from './statusBar';
import { UsageStore } from './storage/usageStore';
import { ClaudeWatcher } from './watchers/claudeWatcher';
import { CopilotWatcher } from './watchers/copilotWatcher';

let store: UsageStore;
let statusBar: StatusBarController;
let dashboard: DashboardProvider;
let copilotWatcher: CopilotWatcher;
let claudeWatcher: ClaudeWatcher;
let enabled = true;

function getFileEstimate(): number {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return 0;
  }
  return estimateTokensFromText(editor.document.getText());
}

function refreshFileBar(): void {
  statusBar?.refresh();
}

export function activate(context: vscode.ExtensionContext): void {
  const config = () => vscode.workspace.getConfiguration('tokguess');

  store = new UsageStore(context);
  copilotWatcher = new CopilotWatcher(config().get('sources.copilot.path'));
  claudeWatcher = new ClaudeWatcher(config().get('sources.claude.path'));

  statusBar = new StatusBarController(store);
  statusBar.bindFileEstimate(getFileEstimate);
  dashboard = new DashboardProvider(
    context.extensionUri,
    store,
    copilotWatcher,
    claudeWatcher,
    getFileEstimate
  );

  const ingest = (event: Parameters<UsageStore['add']>[0]) => {
    if (!enabled) {
      return;
    }
    store.add(event);
    refreshFileBar();
    dashboard.push();
  };

  if (config().get('sources.copilot.enabled', true)) {
    copilotWatcher.onEvent(ingest);
    copilotWatcher.activate(context);
  }

  if (config().get('sources.claude.enabled', true)) {
    claudeWatcher.onEvent(ingest);
    claudeWatcher.activate(context);
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, dashboard),
    vscode.commands.registerCommand('tokguess.openPanel', () => dashboard.openPanel()),
    vscode.commands.registerCommand('tokguess.rescan', async () => {
      await store.rescan();
      copilotWatcher.rescan();
      claudeWatcher.rescan();
      dashboard.push();
      void vscode.window.showInformationMessage('TokGuess: logs rescanned');
    }),
    vscode.commands.registerCommand('tokguess.countCurrentFile', () => {
      const n = getFileEstimate();
      void vscode.window.showInformationMessage(`🤖 ~${n} tokens (file estimate)`);
    }),
    vscode.commands.registerCommand('tokguess.showStats', () => dashboard.openPanel()),
    vscode.commands.registerCommand('tokguess.toggle', () => {
      enabled = !enabled;
      statusBar.setEnabled(enabled);
      void vscode.window.showInformationMessage(`TokGuess ${enabled ? 'enabled' : 'disabled'}`);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => refreshFileBar()),
    vscode.workspace.onDidChangeTextDocument(() => refreshFileBar()),
    copilotWatcher,
    claudeWatcher,
    statusBar
  );

  refreshFileBar();
  dashboard.push();
}

export function deactivate(): void {
  copilotWatcher?.dispose();
  claudeWatcher?.dispose();
  statusBar?.dispose();
}
