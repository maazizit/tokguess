import * as vscode from 'vscode';
import { ProjectAnalyticsEngine } from './analytics/projectAnalytics';
import { CacheDetector } from './analytics/cacheDetector';
import { BudgetManager } from './budget/budgetManager';
import { ContextBudgetAlerts } from './contextBudget';
import { EnhancedDashboardProvider } from './dashboard/EnhancedDashboardProvider';
import { TokenCodeLensProvider } from './decorations/tokenCodeLens';
import { estimateTokensFromText } from './estimator';
import { ReportExporter } from './export/reportExporter';
import { LearningMode } from './learning/learningMode';
import { ContextOptimizer } from './optimizer/contextOptimizer';
import { StatusBarController } from './statusBar';
import { UsageStore } from './storage/usageStore';
import { AntigravityWatcher } from './watchers/antigravityWatcher';
import { ClaudeWatcher } from './watchers/claudeWatcher';
import { CopilotLogWatcher } from './watchers/copilotLogWatcher';
import { CopilotWatcher } from './watchers/copilotWatcher';

let store: UsageStore;
let statusBar: StatusBarController;
let dashboard: EnhancedDashboardProvider;
let budgetAlerts: ContextBudgetAlerts;
let copilotWatcher: CopilotWatcher;
let copilotLogWatcher: CopilotLogWatcher;
let claudeWatcher: ClaudeWatcher;
let antigravityWatcher: AntigravityWatcher;
let budgetManager: BudgetManager;
let contextOptimizer: ContextOptimizer;
let learningMode: LearningMode;
let analyticsEngine: ProjectAnalyticsEngine;
let codeLensProvider: TokenCodeLensProvider;
let reportExporter: ReportExporter;
let cacheDetector: CacheDetector;
let enabled = true;

function getFileEstimate(): number {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return 0;
  }
  return estimateTokensFromText(editor.document.getText());
}

function openDashboard(): void {
  void vscode.commands.executeCommand('workbench.view.extension.tokguess');
}

function refreshUi(): void {
  const snap = budgetAlerts.check();
  statusBar?.updateBudget(snap);
  statusBar?.refresh();
  void dashboard?.refresh();
}

export function activate(context: vscode.ExtensionContext): void {
  const config = () => vscode.workspace.getConfiguration('tokguess');

  store = new UsageStore(context);
  budgetAlerts = new ContextBudgetAlerts();
  budgetManager = new BudgetManager(context);
  contextOptimizer = new ContextOptimizer();
  learningMode = new LearningMode(context);
  analyticsEngine = new ProjectAnalyticsEngine(context);
  codeLensProvider = new TokenCodeLensProvider();
  reportExporter = new ReportExporter(store);
  cacheDetector = new CacheDetector(context);

  copilotWatcher = new CopilotWatcher(config().get('sources.copilot.path'));
  copilotLogWatcher = new CopilotLogWatcher(config().get('sources.copilot.logPath'));
  claudeWatcher = new ClaudeWatcher(config().get('sources.claude.path'));
  antigravityWatcher = new AntigravityWatcher(config().get('sources.antigravity.path'));

  statusBar = new StatusBarController(store);
  dashboard = new EnhancedDashboardProvider(
    context.extensionUri,
    store,
    budgetManager,
    getFileEstimate,
    copilotWatcher,
    copilotLogWatcher,
    claudeWatcher,
    antigravityWatcher
  );

  const ingest = (event: Parameters<UsageStore['add']>[0]) => {
    if (!enabled) {
      return;
    }
    store.add(event);
    refreshUi();

    if (event.model && event.sessionId) {
      void learningMode.recordEstimation({
        timestamp: event.timestamp,
        model: event.model,
        context: event.sessionId.split('-')[0] || 'unknown',
        duration_ms: 0,
        estimated_input: event.inputTokens,
        estimated_output: event.outputTokens,
        estimated_total: event.inputTokens + event.outputTokens
      });
    }
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

  if (config().get('sources.antigravity.enabled', true)) {
    antigravityWatcher.onEvent(ingest);
    antigravityWatcher.activate(context);
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(EnhancedDashboardProvider.viewType, dashboard),

    vscode.languages.registerCodeLensProvider(
      [
        { language: 'typescript' },
        { language: 'javascript' },
        { language: 'typescriptreact' },
        { language: 'javascriptreact' },
        { language: 'python' },
        { language: 'go' },
        { language: 'rust' },
        { language: 'java' },
        { language: 'csharp' }
      ],
      codeLensProvider
    ),

    vscode.commands.registerCommand('tokguess.openPanel', openDashboard),
    vscode.commands.registerCommand('tokguess.openEnhancedDashboard', openDashboard),
    vscode.commands.registerCommand('tokguess.checkBudget', () => budgetAlerts.showCheck()),

    vscode.commands.registerCommand('tokguess.optimizeContext', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showErrorMessage('No active editor');
        return;
      }

      const analysis = contextOptimizer.analyzeContext(
        editor.document.getText(),
        editor.document.languageId
      );

      if (analysis.suggestions.length === 0) {
        void vscode.window.showInformationMessage('Context already optimized. No suggestions.');
        return;
      }

      const optimized = await contextOptimizer.showOptimizationDialog(analysis, editor.document);

      if (optimized) {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        edit.replace(editor.document.uri, fullRange, optimized);
        await vscode.workspace.applyEdit(edit);
        void vscode.window.showInformationMessage(
          `Context optimized. Saved ${analysis.suggestions.reduce((sum, s) => sum + s.tokensSaved, 0).toLocaleString()} tokens`
        );
      }
    }),

    vscode.commands.registerCommand('tokguess.showAnalytics', async () => {
      const events = store.getEvents();
      const analytics = await analyticsEngine.analyzeProject(events, 30);
      const insights = await analyticsEngine.generateInsights(analytics);

      const message = [
        'Project Analytics (30 days)',
        '',
        `Total Cost: $${analytics.total_cost.toFixed(2)}`,
        `Total Tokens: ${analytics.total_tokens.toLocaleString()}`,
        `Daily Avg: ${Math.ceil(analytics.avg_tokens_per_day).toLocaleString()} tokens`,
        `Trend: ${analytics.trend} (${analytics.trend_percent.toFixed(0)}%)`,
        '',
        'Insights:',
        ...insights.map((i) => `  • ${i}`)
      ].join('\n');

      void vscode.window.showInformationMessage(message, 'View Dashboard').then((action) => {
        if (action === 'View Dashboard') {
          openDashboard();
        }
      });
    }),

    vscode.commands.registerCommand('tokguess.showLearningInsights', async () => {
      const insights = await learningMode.getInsights();
      const profile = await learningMode.getUserProfile();

      const message = [
        'Learning Mode Insights',
        '',
        `Total samples: ${profile.total_estimations}`,
        `Avg input:output ratio: ${profile.avg_input_ratio.toFixed(1)}:1`,
        '',
        ...insights.map((i) => `  • ${i}`)
      ].join('\n');

      void vscode.window.showInformationMessage(message);
    }),

    vscode.commands.registerCommand('tokguess.exportReport', async () => {
      await reportExporter.exportReport();
    }),

    vscode.commands.registerCommand('tokguess.showBlockInfo', (block: { type: string; name: string }, tokens: number) => {
      const isHeavy = tokens > 2000;
      const message = isHeavy
        ? `This ${block.type} "${block.name}" contains ~${tokens.toLocaleString()} tokens. Consider splitting it.`
        : `This ${block.type} "${block.name}" contains ~${tokens.toLocaleString()} tokens.`;

      void vscode.window.showInformationMessage(message, 'Optimize', 'Dismiss').then((action) => {
        if (action === 'Optimize') {
          void vscode.commands.executeCommand('tokguess.optimizeContext');
        }
      });
    }),

    vscode.commands.registerCommand('tokguess.checkCacheUsage', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showErrorMessage('No active editor');
        return;
      }

      const docText = editor.document.getText();
      const prediction = cacheDetector.predictCacheUsage(docText, 'claude-sonnet');

      if (prediction.cacheHitLikely) {
        cacheDetector.showCacheNotification(prediction);
      } else {
        void vscode.window.showInformationMessage('No cache detected. Full input token pricing applies.');
      }
    }),

    vscode.commands.registerCommand('tokguess.showCacheStats', () => {
      const stats = cacheDetector.getStats();
      const message = [
        'Cache Detector Stats',
        '',
        `Tracked contexts: ${stats.totalContexts}`,
        `Avg tokens: ${stats.avgTokens.toLocaleString()}`,
        stats.oldestTimestamp
          ? `Oldest: ${Math.round((Date.now() - stats.oldestTimestamp) / 60000)} min ago`
          : ''
      ]
        .filter(Boolean)
        .join('\n');

      void vscode.window.showInformationMessage(message);
    }),

    vscode.commands.registerCommand('tokguess.copyTokenCount', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showErrorMessage('No active editor');
        return;
      }

      const tokens = estimateTokensFromText(editor.document.getText());
      void vscode.env.clipboard.writeText(`${tokens} tokens`);
      void vscode.window.showInformationMessage(`Copied: ${tokens.toLocaleString()} tokens`);
    }),

    vscode.commands.registerCommand('tokguess.checkDailyBudget', async () => {
      const events = store.getEvents();
      const today = new Date().toISOString().split('T')[0];
      const todayEvents = events.filter(
        (e) => new Date(e.timestamp).toISOString().split('T')[0] === today
      );
      const tokensToday = todayEvents.reduce(
        (sum, e) => sum + e.inputTokens + e.outputTokens,
        0
      );

      const status = budgetManager.checkDailyBudget(tokensToday);
      await budgetManager.showBudgetAlert(status);
    }),

    vscode.commands.registerCommand('tokguess.rescan', async () => {
      await store.rescan();
      copilotWatcher.rescan();
      copilotLogWatcher.rescan();
      claudeWatcher.rescan();
      antigravityWatcher.rescan();
      refreshUi();
      void vscode.window.showInformationMessage('TokGuess: logs rescanned');
    }),

    vscode.commands.registerCommand('tokguess.countCurrentFile', () => {
      void budgetAlerts.showCheck();
    }),

    vscode.commands.registerCommand('tokguess.showStats', openDashboard),

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

    vscode.window.onDidChangeTextEditorSelection(() => refreshUi()),
    vscode.window.onDidChangeActiveTextEditor(() => refreshUi()),
    budgetAlerts,
    copilotWatcher,
    copilotLogWatcher,
    claudeWatcher,
    antigravityWatcher,
    statusBar
  );

  refreshUi();
}

export function deactivate(): void {
  copilotWatcher?.dispose();
  copilotLogWatcher?.dispose();
  claudeWatcher?.dispose();
  antigravityWatcher?.dispose();
  budgetAlerts?.dispose();
  statusBar?.dispose();
}
