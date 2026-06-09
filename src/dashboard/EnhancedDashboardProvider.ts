import * as vscode from 'vscode';
import { UsageStore } from '../storage/usageStore';
import { ProjectAnalyticsEngine } from '../analytics/projectAnalytics';
import { BudgetManager } from '../budget/budgetManager';

/**
 * Enhanced Dashboard Provider with Chart.js integration
 * Provides interactive visualizations and insights
 */
export class EnhancedDashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tokguess.dashboard';
  private _view?: vscode.WebviewView;
  private _isDarkMode = true;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly store: UsageStore,
    private readonly analytics: ProjectAnalyticsEngine,
    private readonly budgetManager: BudgetManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'refresh':
          await this.refresh();
          break;
        case 'export':
          await this.exportData(data.format);
          break;
        case 'changePeriod':
          await this.changePeriod(data.days);
          break;
        case 'toggleTheme':
          this._isDarkMode = !this._isDarkMode;
          webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
          await this.refresh();
          break;
      }
    });

    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._view) {
      return;
    }

    const events = this.store.getEvents();
    const analytics = await this.analytics.analyzeProject(events, 30);
    const insights = await this.analytics.generateInsights(analytics);
    const budgetStatus = await this.budgetManager.checkMonthlyCost(analytics.total_cost);

    this._view.webview.postMessage({
      type: 'updateData',
      data: {
        analytics,
        insights,
        budgetStatus
      }
    });
  }

  private async exportData(format: 'csv' | 'json'): Promise<void> {
    const events = this.store.getEvents();
    const analytics = await this.analytics.analyzeProject(events, 30);
    const content = await this.analytics.exportAnalytics(analytics, format);

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`tokguess-export.${format}`),
      filters: {
        [format.toUpperCase()]: [format]
      }
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      void vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    }
  }

  private async changePeriod(days: number): Promise<void> {
    // TODO: Implement period change
    await this.refresh();
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const chartJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'chart.js', 'dist', 'chart.umd.js')
    );

    const themeClass = this._isDarkMode ? 'theme-dark' : 'theme-light';
    
    return `<!DOCTYPE html>
<html lang="en" class="${themeClass}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TokGuess Dashboard</title>
    <script src="${chartJsUri}"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        /* Theme Variables */
        .theme-dark {
            --bg-primary: #1e1e1e;
            --bg-secondary: #252526;
            --bg-tertiary: #2d2d30;
            --text-primary: #cccccc;
            --text-secondary: #999999;
            --accent: #007acc;
            --accent-hover: #005a9e;
            --border: #3e3e42;
            --success: #4ec9b0;
            --warning: #f48771;
            --error: #e81123;
        }
        
        .theme-light {
            --bg-primary: #ffffff;
            --bg-secondary: #f3f3f3;
            --bg-tertiary: #e8e8e8;
            --text-primary: #333333;
            --text-secondary: #666666;
            --accent: #0066cc;
            --accent-hover: #004c99;
            --border: #d4d4d4;
            --success: #16825d;
            --warning: #d97634;
            --error: #e81123;
        }
        
        body {
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: var(--text-primary);
            background: var(--bg-primary);
            transition: all 0.3s ease;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        
        h1 { font-size: 1.5em; font-weight: 600; }
        
        .controls {
            display: flex;
            gap: 8px;
        }
        
        button {
            padding: 6px 12px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            transition: background 0.2s;
        }
        
        button:hover {
            background: var(--accent-hover);
        }
        
        .theme-toggle {
            padding: 6px 10px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
        }
        
        .budget-card {
            background: var(--bg-secondary);
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid var(--border);
        }
        
        .budget-card.success { border-left: 4px solid var(--success); }
        .budget-card.warning { border-left: 4px solid var(--warning); }
        .budget-card.error { border-left: 4px solid var(--error); }
        
        .budget-card.ok { border-left: 4px solid #28a745; }
        .budget-card.warn { border-left: 4px solid #ffc107; }
        .budget-card.critical { border-left: 4px solid #dc3545; }
        
        .budget-amount {
            font-size: 1.8em;
            font-weight: bold;
            margin: 8px 0;
        }
        
        .progress-bar {
            width: 100%;
            height: 8px;
            background: var(--vscode-progressBar-background);
            border-radius: 4px;
            overflow: hidden;
            margin: 12px 0;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-foreground);
            transition: width 0.3s ease;
        }
        
        .chart-container {
            position: relative;
            height: 200px;
            margin: 20px 0;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin: 20px 0;
        }
        
        .stat-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 12px;
            color: var(--text-secondary);
        }
        
        .stat-card {
            background: var(--bg-secondary);
            padding: 16px;
            border-radius: 6px;
            border: 1px solid var(--border);
        }
        
        .insights {
            margin-top: 20px;
        }
        
        .insight-item {
            padding: 10px;
            margin: 8px 0;
            background: var(--bg-secondary);
            border-radius: 4px;
            font-size: 0.9em;
            border-left: 3px solid var(--accent);
        }
        
        .model-list {
            margin-top: 16px;
        }
        
        .model-item {
            display: flex;
            justify-content: space-between;
            padding: 8px;
            margin: 4px 0;
            background: var(--bg-secondary);
            border-radius: 4px;
            border: 1px solid var(--border);
        }
        
        .chart-container {
            background: var(--bg-secondary);
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid var(--border);
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>TokGuess Enhanced</h1>
        <div class="controls">
            <button class="theme-toggle" onclick="toggleTheme()" title="Toggle Light/Dark Mode">
                ${this._isDarkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button onclick="refresh()">🔄</button>
            <button onclick="exportCSV()">📤 Export</button>
        </div>
    </div>
    
    <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-secondary); border-radius: 4px; font-size: 0.85em; color: var(--text-secondary);">
        <strong>Mode:</strong> ${this._isDarkMode ? 'Dark 🌙' : 'Light ☀️'} | 
        <strong>Source:</strong> Chat.log (estimé) | 
        <strong>Précision:</strong> ~75-85% approx.
    </div>

    <div id="content" class="loading">
        <p>Loading data...</p>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentData = null;

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'updateData') {
                currentData = message.data;
                render(message.data);
            }
        });

        function toggleTheme() {
            vscode.postMessage({ type: 'toggleTheme' });
        }

        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }

        function exportCSV() {
            vscode.postMessage({ type: 'export', format: 'csv' });
        }

        function render(data) {
            const { analytics, insights, budgetStatus } = data;
            
            const html = \`
                <div class="budget-card \${budgetStatus.type}">
                    <div>💰 Monthly Budget</div>
                    <div class="budget-amount">$\${analytics.total_cost.toFixed(2)} / $\${budgetStatus.limit}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: \${budgetStatus.percent}%"></div>
                    </div>
                    <div>\${budgetStatus.message}</div>
                </div>

                <div class="chart-container">
                    <canvas id="usageChart"></canvas>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">\${analytics.total_tokens.toLocaleString()}</div>
                        <div class="stat-label">Total Tokens</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${Math.ceil(analytics.avg_tokens_per_day).toLocaleString()}</div>
                        <div class="stat-label">Tokens/Day</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${analytics.total_requests}</div>
                        <div class="stat-label">Requests</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">$\${analytics.projected_monthly_cost.toFixed(2)}</div>
                        <div class="stat-label">Projected/Month</div>
                    </div>
                </div>

                <h3 style="margin-top: 20px;">🎯 Model Distribution</h3>
                <div class="model-list">
                    \${analytics.model_distribution.map(m => \`
                        <div class="model-item">
                            <span>\${m.model}</span>
                            <span>\${m.percent.toFixed(0)}% ($\${m.cost.toFixed(2)})</span>
                        </div>
                    \`).join('')}
                </div>

                <h3 style="margin-top: 20px;">💡 Insights</h3>
                <div class="insights">
                    \${insights.map(i => \`<div class="insight-item">\${i}</div>\`).join('')}
                </div>
            \`;
            
            document.getElementById('content').innerHTML = html;
            
            // Render chart
            renderChart(analytics.daily_stats);
        }

        function renderChart(dailyStats) {
            const ctx = document.getElementById('usageChart');
            if (!ctx) return;
            
            // Detect current theme
            const isDark = document.documentElement.classList.contains('theme-dark');
            const textColor = isDark ? '#cccccc' : '#333333';
            const gridColor = isDark ? '#3e3e42' : '#d4d4d4';
            const accentColor = isDark ? '#007acc' : '#0066cc';

            const labels = dailyStats.map(d => {
                const date = new Date(d.date);
                return (date.getMonth() + 1) + '/' + date.getDate();
            });
            
            const tokenData = dailyStats.map(d => d.tokens_input + d.tokens_output);

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Tokens',
                        data: tokenData,
                        borderColor: accentColor,
                        backgroundColor: isDark ? 'rgba(0, 122, 204, 0.1)' : 'rgba(0, 102, 204, 0.1)',
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { 
                            display: false 
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: textColor },
                            grid: { color: gridColor }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: textColor,
                                callback: value => value.toLocaleString()
                            },
                            grid: { color: gridColor }
                        }
                    }
                }
            });
        }

        // Request initial data
        refresh();
    </script>
</body>
</html>`;
  }
}
