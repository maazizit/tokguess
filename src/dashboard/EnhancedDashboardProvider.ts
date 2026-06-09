import * as vscode from 'vscode';
import { getContextBudgetSnapshot } from '../contextBudget';
import { BudgetManager } from '../budget/budgetManager';
import { ReportExporter } from '../export/reportExporter';
import { PrecisionModeController } from '../precision/precisionMode';
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
    private readonly reportExporter: ReportExporter,
    private readonly precision: PrecisionModeController
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
        case 'enablePrecision':
          await vscode.commands.executeCommand('tokguess.enablePrecision');
          break;
        case 'disablePrecision':
          await vscode.commands.executeCommand('tokguess.disablePrecision');
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

    const precision = this.precision.getState();
    if (precision.status === 'otel') {
      dashboard.dataQuality.sourceLabel = 'Local OTel · real Copilot tokens';
      dashboard.dataQuality.accuracyLabel = 'real (Copilot)';
    } else if (precision.status === 'fallback') {
      dashboard.dataQuality.sourceLabel = 'Chat.log fallback · OTel unavailable';
      dashboard.dataQuality.accuracyLabel = '~75–85% approx.';
    }

    const budgetStatus = await this.budgetManager.checkMonthlyCost(dashboard.period.cost);
    const chart = buildChartSeries(this.store.getEvents(), this._period);
    const copilotEnabled = config.get<boolean>('sources.copilot.enabled', true);

    this._view.webview.postMessage({
      type: 'updateData',
      data: {
        dashboard,
        budgetStatus,
        period: this._period,
        chart,
        precision,
        copilotEnabled
      }
    });
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

    .theme-dark {
      --bg: #0f1117;
      --bg-grad: radial-gradient(1100px 500px at 15% -10%, #1a2036, var(--bg));
      --card: rgba(30, 33, 48, 0.72);
      --card-solid: #1d2130;
      --border: rgba(137, 180, 250, 0.16);
      --text: #e7eaf2;
      --muted: #8b93a7;
      --accent: #89b4fa;
      --accent2: #cba6f7;
      --green: #3dd68c;
      --yellow: #f9e2af;
      --red: #f38ba8;
      --chart-fill: rgba(137, 180, 250, 0.14);
      --shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
      --pill-bg: rgba(137, 180, 250, 0.10);
    }
    .theme-light {
      --bg: #f6f7fb;
      --bg-grad: radial-gradient(1100px 500px at 15% -10%, #e8edfb, var(--bg));
      --card: rgba(255, 255, 255, 0.85);
      --card-solid: #ffffff;
      --border: rgba(70, 90, 140, 0.14);
      --text: #1c2333;
      --muted: #66708a;
      --accent: #3b6fe0;
      --accent2: #8a5fd6;
      --green: #14855c;
      --yellow: #b07c1f;
      --red: #c4314b;
      --chart-fill: rgba(59, 111, 224, 0.12);
      --shadow: 0 8px 24px rgba(28, 35, 51, 0.08);
      --pill-bg: rgba(59, 111, 224, 0.08);
    }

    body {
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: var(--text);
      background: var(--bg-grad);
      min-height: 100vh;
      font-size: 13px;
      transition: background .3s ease, color .3s ease;
    }

    /* ---------- Header ---------- */
    .header { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo {
      width: 38px; height: 38px; border-radius: 11px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      display: grid; place-items: center;
      font-weight: 800; font-size: 15px; color: #fff;
      box-shadow: var(--shadow);
    }
    h1 { font-size: 17px; font-weight: 750; letter-spacing: -0.01em; }
    .sub { font-size: 11px; color: var(--muted); margin-top: 1px; }

    /* ---------- Controls ---------- */
    .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .segment {
      display: inline-flex; background: var(--card); border: 1px solid var(--border);
      border-radius: 999px; padding: 3px; box-shadow: var(--shadow);
    }
    .segment button {
      border: none; background: transparent; color: var(--muted);
      padding: 5px 13px; font-size: 11px; font-weight: 600; border-radius: 999px;
      cursor: pointer; transition: all .18s ease;
    }
    .segment button.active {
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff;
    }
    .iconbar { display: inline-flex; gap: 6px; }
    .iconbar button {
      border: 1px solid var(--border); background: var(--card); color: var(--text);
      width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
      display: grid; place-items: center; font-size: 13px;
      transition: transform .15s ease, border-color .15s ease;
    }
    .iconbar button:hover { transform: translateY(-1px); border-color: var(--accent); }
    .precision-btn {
      border: 1px solid var(--border); border-radius: 999px;
      padding: 6px 13px; font-size: 11px; font-weight: 650; cursor: pointer;
      background: var(--card); color: var(--text);
      transition: all .18s ease;
    }
    .precision-btn[data-mode="off"]:hover { border-color: var(--accent); color: var(--accent); }
    .precision-btn[data-mode="on"] {
      background: linear-gradient(135deg, var(--green), #7ee8b5); color: #08291a; border-color: transparent;
    }
    .precision-btn:disabled { opacity: .45; cursor: not-allowed; }

    /* ---------- Status pills ---------- */
    .status-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
    .pill {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 10px; font-weight: 600; padding: 4px 10px;
      border-radius: 999px; background: var(--pill-bg);
      border: 1px solid var(--border); color: var(--muted);
    }
    .pill .dot { width: 6px; height: 6px; border-radius: 50%; }
    .dot.ok { background: var(--green); }
    .dot.warn { background: var(--yellow); }
    .dot.info { background: var(--accent); }

    /* ---------- Cards ---------- */
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 14px; padding: 15px 16px; margin-bottom: 12px;
      backdrop-filter: blur(10px); box-shadow: var(--shadow);
    }
    .label {
      font-size: 10px; color: var(--muted); text-transform: uppercase;
      letter-spacing: .08em; font-weight: 650; margin-bottom: 7px;
    }
    .hero { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
    .stat { position: relative; overflow: hidden; }
    .stat::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      border-radius: 14px 14px 0 0;
    }
    .value { font-size: 23px; font-weight: 800; letter-spacing: -0.02em; margin-top: 2px; }
    .hint { font-size: 10px; color: var(--muted); margin-top: 5px; line-height: 1.4; }

    /* ---------- Compare table ---------- */
    .compare-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .compare-table th, .compare-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); }
    .compare-table th { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
    .compare-table tr:last-child td { border-bottom: none; }
    .compare-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .delta {
      display: inline-flex; align-items: center; gap: 4px;
      font-weight: 700; font-size: 11px; margin-top: 9px;
      padding: 3px 9px; border-radius: 999px;
    }
    .delta.up { color: var(--red); background: color-mix(in srgb, var(--red) 12%, transparent); }
    .delta.down { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }
    .delta.flat { color: var(--muted); background: var(--pill-bg); }

    /* ---------- Chart ---------- */
    .chart-box { height: 185px; position: relative; margin-top: 4px; }

    /* ---------- Budget ---------- */
    .budget-bar { height: 9px; background: var(--border); border-radius: 99px; overflow: hidden; margin: 9px 0 7px; }
    .budget-fill {
      height: 100%; border-radius: 99px; transition: width .4s ease;
      background: linear-gradient(90deg, var(--green), #7ee8b5);
    }
    .budget-fill.warn { background: linear-gradient(90deg, var(--yellow), #fab387); }
    .budget-fill.over { background: linear-gradient(90deg, var(--red), #eba0ac); }

    /* ---------- Models ---------- */
    .model-row { margin-bottom: 11px; }
    .model-row:last-child { margin-bottom: 0; }
    .model-head { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; }
    .model-name { font-weight: 600; }
    .model-meta { color: var(--muted); font-variant-numeric: tabular-nums; }
    .bar-bg { height: 5px; background: var(--border); border-radius: 99px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width .4s ease; }

    .loading { text-align: center; padding: 48px 0; color: var(--muted); }
    .footer { text-align: center; font-size: 10px; color: var(--muted); margin-top: 4px; line-height: 1.5; }

    @media (max-width: 640px) { .hero { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="logo">TG</div>
      <div>
        <h1>TokGuess</h1>
        <div class="sub">Token tracking · 100% local</div>
      </div>
    </div>
    <div class="toolbar">
      <div class="segment">
        <button class="${this._period === 'today' ? 'active' : ''}" data-period="today">Today</button>
        <button class="${this._period === 'week' ? 'active' : ''}" data-period="week">7 days</button>
        <button class="${this._period === 'month' ? 'active' : ''}" data-period="month">30 days</button>
      </div>
      <button id="precisionBtn" class="precision-btn" data-mode="off" onclick="togglePrecision()" title="Real Copilot tokens via local OTel">🎯 Precision</button>
      <div class="iconbar">
        <button onclick="toggleTheme()" title="Toggle light/dark">${this._isDarkMode ? '☀️' : '🌙'}</button>
        <button onclick="exportReport()" title="Export CSV / JSON / Markdown">📤</button>
        <button onclick="refresh()" title="Refresh">🔄</button>
      </div>
    </div>
  </div>

  <div class="status-row" id="statusRow"></div>
  <div id="content" class="loading"><p>Loading data…</p></div>
  <div class="footer" id="footer"></div>

  <script>
    const vscode = acquireVsCodeApi();
    let chart = null;

    document.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-period]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        vscode.postMessage({ type: 'setPeriod', period: btn.dataset.period });
      });
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'updateData') render(event.data.data);
    });

    function toggleTheme() { vscode.postMessage({ type: 'toggleTheme' }); }
    function refresh() { vscode.postMessage({ type: 'refresh' }); }
    function exportReport() { vscode.postMessage({ type: 'export' }); }
    function togglePrecision() {
      const btn = document.getElementById('precisionBtn');
      if (btn?.dataset.mode === 'off') {
        vscode.postMessage({ type: 'enablePrecision' });
      } else if (btn?.dataset.mode === 'on') {
        vscode.postMessage({ type: 'disablePrecision' });
      }
    }

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

    function render({ dashboard: d, budgetStatus, period, chart: chartSeries, precision, copilotEnabled }) {
      const p = d.period;
      const dq = d.dataQuality || {};
      const btn = document.getElementById('precisionBtn');

      if (btn) {
        if (!copilotEnabled) {
          btn.textContent = '🎯 Copilot required';
          btn.disabled = true;
          btn.dataset.mode = 'disabled';
        } else if (precision?.status === 'otel') {
          btn.textContent = '✓ Precision on';
          btn.disabled = false;
          btn.dataset.mode = 'on';
        } else {
          btn.textContent = '🎯 Precision';
          btn.disabled = false;
          btn.dataset.mode = 'off';
        }
      }

      const isReal = precision?.status === 'otel';
      const isFallback = precision?.status === 'fallback';
      document.getElementById('statusRow').innerHTML =
        '<span class="pill"><span class="dot ' + (isReal ? 'ok' : isFallback ? 'warn' : 'info') + '"></span>' +
          (dq.sourceLabel || 'No source') + '</span>' +
        '<span class="pill">Accuracy: ' + (dq.accuracyLabel || '—') + '</span>' +
        (precision?.collectorRunning ? '<span class="pill"><span class="dot ok"></span>Collector running</span>' : '');

      const periodLabel = period === 'today' ? 'today' : period === 'week' ? 'last 7 days' : 'last 30 days';

      const compareHtml = d.periodCompare ? \`
        <div class="card">
          <div class="label">Today vs yesterday</div>
          <table class="compare-table">
            <thead><tr><th>Period</th><th class="num">Requests</th><th class="num">Tokens</th><th class="num">Est. cost</th></tr></thead>
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
          <span class="delta \${d.periodCompare.tokenDeltaPct > 0 ? 'up' : d.periodCompare.tokenDeltaPct < 0 ? 'down' : 'flat'}">
            \${d.periodCompare.tokenDeltaPct > 0 ? '▲ +' + d.periodCompare.tokenDeltaPct + '% tokens vs yesterday' :
              d.periodCompare.tokenDeltaPct < 0 ? '▼ ' + d.periodCompare.tokenDeltaPct + '% tokens vs yesterday' :
              '— stable vs yesterday'}
          </span>
        </div>\` : '';

      const maxModel = Math.max(...(d.topModels || []).map((m) => m.tokens), 1);
      const modelsHtml = (d.topModels || []).map((m) => \`
        <div class="model-row">
          <div class="model-head">
            <span class="model-name">\${m.model}</span>
            <span class="model-meta">\${fmtTok(m.tokens)} · \${fmtCost(m.cost)}</span>
          </div>
          <div class="bar-bg"><div class="bar-fill" style="width:\${Math.round((m.tokens / maxModel) * 100)}%"></div></div>
        </div>\`).join('') || '<div class="hint">No model data yet — use Copilot or Claude, then Rescan Logs.</div>';

      const budgetPct = Math.min(budgetStatus.percent, 100);
      const budgetClass = budgetStatus.percent >= 100 ? 'over' : budgetStatus.percent >= 75 ? 'warn' : '';

      document.getElementById('content').className = '';
      document.getElementById('content').innerHTML = \`
        <div class="hero">
          <div class="card stat">
            <div class="label">Requests · \${periodLabel}</div>
            <div class="value">\${dq.totalRequests || p.events || 0}</div>
            <div class="hint">\${dq.estimatedRequests ? 'includes ~estimated (Chat.log)' : 'tracked messages'}</div>
          </div>
          <div class="card stat">
            <div class="label">Total tokens</div>
            <div class="value">\${fmtTok(p.totalTokens)}</div>
            <div class="hint">in \${fmtTok(p.inputTokens)} · out \${fmtTok(p.outputTokens)}</div>
          </div>
          <div class="card stat">
            <div class="label">Estimated cost</div>
            <div class="value">\${fmtCost(p.cost)}</div>
            <div class="hint">public API rates · not your Copilot bill</div>
          </div>
        </div>
        \${compareHtml}
        <div class="card">
          <div class="label">Usage trend · \${periodLabel}</div>
          <div class="chart-box"><canvas id="usageChart"></canvas></div>
        </div>
        <div class="card">
          <div class="label">Monthly budget</div>
          <div class="value" style="font-size:18px">\${fmtCost(p.cost)} <span style="font-size:12px;color:var(--muted);font-weight:600">/ $\${budgetStatus.limit}</span></div>
          <div class="budget-bar"><div class="budget-fill \${budgetClass}" style="width:\${budgetPct}%"></div></div>
          <div class="hint">\${budgetStatus.message}</div>
        </div>
        <div class="card">
          <div class="label">Top models</div>
          \${modelsHtml}
        </div>\`;

      document.getElementById('footer').textContent =
        (d.lastIngest ? 'Last ingest: ' + new Date(d.lastIngest).toLocaleString('en-US') : 'Waiting for data') +
        ' · Ctrl+Shift+T to reopen · Rescan Logs to rebuild';

      renderChart(chartSeries);
    }

    function renderChart(series) {
      const ctx = document.getElementById('usageChart');
      if (!ctx || typeof Chart === 'undefined') return;
      if (chart) { chart.destroy(); chart = null; }

      const css = getComputedStyle(document.documentElement);
      const isDark = document.documentElement.classList.contains('theme-dark');
      const textColor = isDark ? '#8b93a7' : '#66708a';
      const gridColor = isDark ? 'rgba(137,180,250,0.08)' : 'rgba(70,90,140,0.10)';
      const accent = isDark ? '#89b4fa' : '#3b6fe0';
      const fill = isDark ? 'rgba(137,180,250,0.14)' : 'rgba(59,111,224,0.12)';

      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: series.labels,
          datasets: [{
            label: 'Tokens',
            data: series.data,
            borderColor: accent,
            borderWidth: 2,
            backgroundColor: fill,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.35,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: textColor, maxTicksLimit: 8, font: { size: 10 } },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { color: textColor, font: { size: 10 }, callback: (v) => fmtTok(v) },
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
    buckets.set(dt.toISOString().slice(0, 10), 0);
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
    const dt = new Date(key);
    labels.push(`${dt.getMonth() + 1}/${dt.getDate()}`);
    data.push(buckets.get(key) ?? 0);
  }

  return { labels, data };
}
