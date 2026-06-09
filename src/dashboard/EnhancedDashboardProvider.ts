import * as vscode from 'vscode';
import { getContextBudgetSnapshot } from '../contextBudget';
import { BudgetManager } from '../budget/budgetManager';
import { ReportExporter } from '../export/reportExporter';
import { UsageStore } from '../storage/usageStore';
import { TokenEvent } from '../types';
import { AntigravityWatcher } from '../watchers/antigravityWatcher';
import { ClaudeWatcher } from '../watchers/claudeWatcher';
import { CopilotLogWatcher } from '../watchers/copilotLogWatcher';
import { CopilotWatcher } from '../watchers/copilotWatcher';

type DashboardPeriod = 'today' | 'week' | 'month';

export class EnhancedDashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tokguess.dashboard';
  private _view?: vscode.WebviewView;
  private _isDarkMode = true;
  private _period: DashboardPeriod = 'today';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly store: UsageStore,
    private readonly budgetManager: BudgetManager,
    private readonly getFileEstimate: () => number,
    private readonly copilot: CopilotWatcher,
    private readonly copilotLog: CopilotLogWatcher,
    private readonly claude: ClaudeWatcher,
    private readonly antigravity: AntigravityWatcher,
    private readonly reportExporter: ReportExporter
  ) {
    store.onChange(() => void this.refresh());
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
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
          await this.reportExporter.exportReport();
          break;
        case 'setPeriod':
          if (['today', 'week', 'month'].includes(data.period)) {
            this._period = data.period as DashboardPeriod;
            await this.refresh();
          }
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

    const config = vscode.workspace.getConfiguration('tokguess');
    const budget = getContextBudgetSnapshot();
    const dashboard = this.store.buildDashboard(this._period, this.getFileEstimate(), {
      copilot: {
        enabled: config.get<boolean>('sources.copilot.enabled', true),
        path: this.copilot.isActive()
          ? this.copilot.path
          : `${this.copilotLog.path} (Chat.log)`,
        active: this.copilot.isActive() || this.copilotLog.isActive()
      },
      claude: {
        enabled: config.get<boolean>('sources.claude.enabled', true),
        path: this.claude.paths.join(', '),
        active: this.claude.isActive()
      },
      antigravity: {
        enabled: config.get<boolean>('sources.antigravity.enabled', true),
        path: this.antigravity.paths.join(', '),
        active: this.antigravity.isActive()
      }
    });

    dashboard.contextBudget = {
      fileTokens: budget.fileTokens,
      selectionTokens: budget.selectionTokens,
      contextTokens: budget.contextTokens,
      threshold: budget.threshold,
      percent: budget.percent,
      level: budget.level,
      hasSelection: budget.hasSelection,
      fileName: budget.fileName
    };

    const budgetStatus = await this.budgetManager.checkMonthlyCost(dashboard.period.cost);
    const chart = buildChartSeries(this.store.getEvents(), this._period);

    this._view.webview.postMessage({
      type: 'updateData',
      data: {
        dashboard,
        budgetStatus,
        period: this._period,
        chart
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const chartJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'chart.js', 'dist', 'chart.umd.js')
    );
    const themeClass = this._isDarkMode ? 'theme-dark' : 'theme-light';

    return `<!DOCTYPE html>
<html lang="fr" class="${themeClass}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TokGuess Dashboard</title>
  <script src="${chartJsUri}"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .theme-dark {
      --bg: #1e1e1e; --card: #252526; --muted: #999; --text: #ccc;
      --border: #3e3e42; --accent: #007acc; --accent-hover: #005a9e;
      --success: #4ec9b0; --warning: #f48771; --up: #f38ba8; --down: #3dd68c;
    }
    .theme-light {
      --bg: #fff; --card: #f3f3f3; --muted: #666; --text: #333;
      --border: #d4d4d4; --accent: #0066cc; --accent-hover: #004c99;
      --success: #16825d; --warning: #d97634; --up: #c42b1c; --down: #16825d;
    }
    body {
      padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: var(--text); background: var(--bg); transition: background .3s, color .3s;
      font-size: 13px;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    h1 { font-size: 17px; font-weight: 700; }
    .sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .controls, .filters { display: flex; gap: 6px; flex-wrap: wrap; }
    button, .chip {
      padding: 6px 12px; border-radius: 999px; font-size: 11px; cursor: pointer;
      border: 1px solid var(--border); background: transparent; color: var(--muted);
    }
    button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    button.primary:hover { background: var(--accent-hover); }
    .chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .banner {
      padding: 8px 12px; border-radius: 8px; background: var(--card);
      border: 1px solid var(--border); color: var(--muted); font-size: 11px; margin-bottom: 12px;
    }
    .hero { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
    .card {
      background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px;
      margin-bottom: 12px;
    }
    .label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
    .value { font-size: 22px; font-weight: 800; }
    .hint { font-size: 10px; color: var(--muted); margin-top: 4px; }
    .compare-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .compare-table th, .compare-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); }
    .compare-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .delta { font-weight: 600; font-size: 11px; margin-top: 8px; }
    .delta.up { color: var(--up); } .delta.down { color: var(--down); } .delta.flat { color: var(--muted); }
    .chart-box { height: 180px; position: relative; }
    .budget-fill { height: 100%; background: var(--accent); transition: width .3s; }
    .budget-bar { height: 8px; background: var(--border); border-radius: 99px; overflow: hidden; margin: 8px 0; }
    .model-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
    .model-item:last-child { border-bottom: none; }
    .loading { text-align: center; padding: 40px; color: var(--muted); }
    @media (max-width: 640px) { .hero { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>TokGuess</h1>
      <div class="sub">Suivi tokens · 100% local</div>
    </div>
    <div class="controls">
      <button class="chip${this._period === 'today' ? ' active' : ''}" data-period="today">Aujourd'hui</button>
      <button class="chip${this._period === 'week' ? ' active' : ''}" data-period="week">7 jours</button>
      <button class="chip${this._period === 'month' ? ' active' : ''}" data-period="month">30 jours</button>
      <button onclick="toggleTheme()">${this._isDarkMode ? '☀️ Light' : '🌙 Dark'}</button>
      <button onclick="exportReport()" title="Exporter CSV / JSON / Markdown">📤 Export</button>
      <button class="primary" onclick="refresh()" title="Rafraîchir">🔄</button>
    </div>
  </div>

  <div class="banner" id="banner">Chargement…</div>
  <div id="content" class="loading"><p>Chargement des données…</p></div>

  <script>
    const vscode = acquireVsCodeApi();
    let chart = null;
    let activePeriod = '${this._period}';

    document.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-period]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activePeriod = btn.dataset.period;
        vscode.postMessage({ type: 'setPeriod', period: activePeriod });
      });
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'updateData') render(event.data.data);
    });

    function toggleTheme() { vscode.postMessage({ type: 'toggleTheme' }); }
    function refresh() { vscode.postMessage({ type: 'refresh' }); }
    function exportReport() { vscode.postMessage({ type: 'export' }); }

    function fmtTok(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return String(n | 0);
    }
    function fmtCost(n) {
      if (n < 0.01) return '$' + n.toFixed(4);
      if (n < 1) return '$' + n.toFixed(3);
      return '$' + n.toFixed(2);
    }

    function render({ dashboard: d, budgetStatus, period, chart: chartSeries }) {
      const p = d.period;
      const dq = d.dataQuality || {};

      document.getElementById('banner').innerHTML =
        '<strong>Source :</strong> ' + (dq.sourceLabel || '—') +
        ' · <strong>Précision :</strong> ' + (dq.accuracyLabel || '—') +
        ' · <strong>Mode :</strong> ' + (document.documentElement.classList.contains('theme-dark') ? 'Dark' : 'Light');

      const periodLabel = period === 'today' ? "aujourd'hui" : period === 'week' ? '7 jours' : '30 jours';
      const compareHtml = d.periodCompare ? \`
        <div class="card">
          <div class="label">Comparaison · aujourd'hui vs hier</div>
          <table class="compare-table">
            <thead><tr><th>Période</th><th class="num">Requêtes</th><th class="num">Tokens</th><th class="num">Coût est.</th></tr></thead>
            <tbody>
              <tr><td><strong>\${d.periodCompare.currentLabel}</strong></td>
                <td class="num">\${d.periodCompare.currentRequests}</td>
                <td class="num">\${fmtTok(d.periodCompare.currentTokens)}</td>
                <td class="num">\${fmtCost(d.periodCompare.currentCost)}</td></tr>
              <tr><td>\${d.periodCompare.previousLabel}</td>
                <td class="num">\${d.periodCompare.previousRequests}</td>
                <td class="num">\${fmtTok(d.periodCompare.previousTokens)}</td>
                <td class="num">\${fmtCost(d.periodCompare.previousCost)}</td></tr>
            </tbody>
          </table>
          <div class="delta \${d.periodCompare.tokenDeltaPct > 0 ? 'up' : d.periodCompare.tokenDeltaPct < 0 ? 'down' : 'flat'}">
            \${d.periodCompare.tokenDeltaPct > 0 ? '+' + d.periodCompare.tokenDeltaPct + '% tokens vs hier' :
              d.periodCompare.tokenDeltaPct < 0 ? d.periodCompare.tokenDeltaPct + '% tokens vs hier' :
              'stable vs hier'}
          </div>
        </div>\` : '';

      const modelsHtml = (d.topModels || []).map((m) =>
        '<div class="model-item"><span>' + m.model + '</span><span>' + fmtTok(m.tokens) + ' · ' + fmtCost(m.cost) + '</span></div>'
      ).join('') || '<div class="hint">Pas encore de données modèle</div>';

      document.getElementById('content').innerHTML = \`
        <div class="hero">
          <div class="card"><div class="label">Requêtes (\${periodLabel})</div>
            <div class="value">\${dq.totalRequests || p.events || 0}</div>
            <div class="hint">\${dq.estimatedRequests ? 'dont ~estimées (Chat.log)' : 'messages trackés'}</div></div>
          <div class="card"><div class="label">Tokens total</div>
            <div class="value">\${fmtTok(p.totalTokens)}</div>
            <div class="hint">in \${fmtTok(p.inputTokens)} · out \${fmtTok(p.outputTokens)}</div></div>
          <div class="card"><div class="label">Coût estimé</div>
            <div class="value">\${fmtCost(p.cost)}</div>
            <div class="hint">tarifs API publics</div></div>
        </div>
        \${compareHtml}
        <div class="card">
          <div class="label">Tendance · \${periodLabel}</div>
          <div class="chart-box"><canvas id="usageChart"></canvas></div>
        </div>
        <div class="card">
          <div class="label">Budget mensuel</div>
          <div class="value" style="font-size:18px">\${fmtCost(p.cost)} / $\${budgetStatus.limit}</div>
          <div class="budget-bar"><div class="budget-fill" style="width:\${Math.min(budgetStatus.percent, 100)}%"></div></div>
          <div class="hint">\${budgetStatus.message}</div>
        </div>
        <div class="card">
          <div class="label">Modèles les plus utilisés</div>
          \${modelsHtml}
        </div>\`;

      renderChart(chartSeries);
    }

    function renderChart(series) {
      const ctx = document.getElementById('usageChart');
      if (!ctx || typeof Chart === 'undefined') return;
      if (chart) { chart.destroy(); chart = null; }

      const isDark = document.documentElement.classList.contains('theme-dark');
      const textColor = isDark ? '#ccc' : '#333';
      const gridColor = isDark ? '#3e3e42' : '#d4d4d4';
      const accent = isDark ? '#007acc' : '#0066cc';

      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: series.labels,
          datasets: [{
            label: 'Tokens',
            data: series.data,
            borderColor: accent,
            backgroundColor: isDark ? 'rgba(0,122,204,.12)' : 'rgba(0,102,204,.12)',
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
            y: {
              beginAtZero: true,
              ticks: { color: textColor, callback: (v) => fmtTok(v) },
              grid: { color: gridColor }
            }
          }
        }
      });
    }

    refresh();
  </script>
</body>
</html>`;
  }
}

function buildChartSeries(
  events: TokenEvent[],
  period: DashboardPeriod
): { labels: string[]; data: number[] } {
  if (period === 'today') {
    const hourly = Array.from({ length: 24 }, () => 0);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (const e of events) {
      if (e.timestamp >= start.getTime()) {
        hourly[new Date(e.timestamp).getHours()] +=
          e.inputTokens + e.outputTokens + e.cacheReadTokens;
      }
    }
    return {
      labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
      data: hourly
    };
  }

  const days = period === 'week' ? 7 : 30;
  const labels: string[] = [];
  const data: number[] = [];
  const buckets = new Map<string, number>();

  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    dt.setHours(0, 0, 0, 0);
    const key = dt.toISOString().slice(0, 10);
    buckets.set(key, 0);
    labels.push(`${dt.getMonth() + 1}/${dt.getDate()}`);
  }

  for (const e of events) {
    const key = new Date(e.timestamp).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(
        key,
        (buckets.get(key) ?? 0) + e.inputTokens + e.outputTokens + e.cacheReadTokens
      );
    }
  }

  for (const key of buckets.keys()) {
    data.push(buckets.get(key) ?? 0);
  }

  return { labels, data };
}
