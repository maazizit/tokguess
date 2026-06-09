import * as vscode from 'vscode';
import { estimateCost } from '../pricing';
import {
  DashboardPayload,
  DataQuality,
  DayStats,
  PeriodCompare,
  SessionRow,
  TokenEvent,
  TokenSource
} from '../types';

const STORAGE_KEY = 'tokguess.events';
const MAX_EVENTS = 8000;

export class UsageStore {
  private events: TokenEvent[] = [];
  private listeners: Array<() => void> = [];
  private liveCopilotOutput = 0;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.events = context.globalState.get<TokenEvent[]>(STORAGE_KEY, []);
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  getLiveCopilotOutput(): number {
    return this.liveCopilotOutput;
  }

  add(event: TokenEvent): void {
    if (event.liveOnly) {
      this.liveCopilotOutput += event.outputTokens;
      this.notify();
      return;
    }
    const existing = this.events.findIndex((e) => e.id === event.id);
    if (existing >= 0) {
      if (event.replace) {
        this.events[existing] = { ...event, replace: undefined };
        void this.persist();
        this.notify();
      }
      return;
    }
    const toStore = { ...event, replace: undefined, liveOnly: undefined };
    this.events.push(toStore);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS / 2);
    }
    void this.persist();
    this.notify();
  }

  async rescan(): Promise<void> {
    this.events = [];
    this.liveCopilotOutput = 0;
    await this.persist();
    this.notify();
  }

  removeEstimatedCopilot(): void {
    const before = this.events.length;
    this.events = this.events.filter((e) => !(e.source === 'copilot' && e.estimated));
    if (this.events.length !== before) {
      void this.persist();
      this.notify();
    }
  }

  getEvents(): TokenEvent[] {
    return [...this.events];
  }

  /**
   * Alias for getEvents - used by ReportExporter
   */
  getAllEvents(): TokenEvent[] {
    return this.getEvents();
  }

  buildDashboard(
    period: 'today' | 'week' | 'month',
    fileEstimate: number,
    sources: DashboardPayload['sources']
  ): DashboardPayload {
    const now = Date.now();
    const start = periodStart(period, now);
    const inPeriod = this.events.filter((e) => e.timestamp >= start);
    const todayStart = periodStart('today', now);
    const todayEvents = this.events.filter((e) => e.timestamp >= todayStart);

    const today = aggregateDay(todayEvents, isoDate(now));
    const periodStats = aggregatePeriod(inPeriod, period);

    const modelTotals = new Map<string, { tokens: number; cost: number }>();
    for (const e of inPeriod) {
      const total = e.inputTokens + e.outputTokens + e.cacheReadTokens;
      const cost = estimateCost(e.model, e.inputTokens, e.outputTokens, e.cacheReadTokens);
      const cur = modelTotals.get(e.model ?? 'unknown') ?? { tokens: 0, cost: 0 };
      cur.tokens += total;
      cur.cost += cost;
      modelTotals.set(e.model ?? 'unknown', cur);
    }

    const modelEstimated = new Map<string, boolean>();
    for (const e of inPeriod) {
      const m = e.model ?? 'unknown';
      if (e.estimated) {
        modelEstimated.set(m, true);
      }
    }

    const grand = [...modelTotals.values()].reduce((s, m) => s + m.tokens, 0) || 1;
    const topModels = [...modelTotals.entries()]
      .map(([model, v]) => ({
        model,
        tokens: v.tokens,
        cost: v.cost,
        pct: Math.round((v.tokens / grand) * 100),
        estimated: modelEstimated.get(model) ?? false
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 6);

    const sessionTable = buildSessionTable(inPeriod);
    const recentSessions = sessionTable.slice(0, 8).map((s) => ({
      sessionId: s.id.slice(0, 12),
      source: s.source,
      tokens: s.totalTokens,
      cost: s.cost,
      lastSeen: s.lastSeen
    }));

    const estimatedRequests = inPeriod.filter((e) => e.estimated).length;
    const realRequests = inPeriod.length - estimatedRequests;
    const dataQuality = buildDataQuality(inPeriod, estimatedRequests, realRequests);

    let periodCompare: PeriodCompare | undefined;
    if (period === 'today') {
      periodCompare = buildDayCompare(this.events, now);
    }

    const lastIngest = this.events.length
      ? Math.max(...this.events.map((e) => e.timestamp))
      : null;

    return {
      today,
      period: periodStats,
      periodLabel: period,
      dataQuality,
      periodCompare,
      sessionTable,
      topModels,
      recentSessions,
      fileEstimate,
      liveCopilotOutput: this.liveCopilotOutput,
      lastIngest,
      sources
    };
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.events);
  }

  private notify(): void {
    for (const l of this.listeners) {
      l();
    }
  }
}

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function periodStart(period: 'today' | 'week' | 'month', now: number): number {
  const d = new Date(now);
  if (period === 'today') {
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (period === 'week') {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function aggregateDay(events: TokenEvent[], date: string): DayStats {
  const hourly = Array.from({ length: 24 }, () => 0);
  const stats: DayStats = {
    date,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    cost: 0,
    events: events.length,
    byModel: {},
    bySource: { copilot: 0, claude: 0, antigravity: 0, estimate: 0 },
    hourly
  };

  for (const e of events) {
    addEvent(stats, e);
    const h = new Date(e.timestamp).getHours();
    hourly[h] += e.inputTokens + e.outputTokens + e.cacheReadTokens;
  }
  return stats;
}

function aggregatePeriod(events: TokenEvent[], label: 'today' | 'week' | 'month'): DayStats {
  const stats: DayStats = {
    date: label,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    cost: 0,
    events: events.length,
    byModel: {},
    bySource: { copilot: 0, claude: 0, antigravity: 0, estimate: 0 },
    hourly: Array.from({ length: 24 }, () => 0)
  };
  for (const e of events) {
    addEvent(stats, e);
  }
  return stats;
}

function buildSessionTable(events: TokenEvent[]): SessionRow[] {
  const map = new Map<
    string,
    {
      label: string;
      source: TokenSource;
      models: Map<string, number>;
      requests: number;
      input: number;
      output: number;
      cost: number;
      estimated: boolean;
      startedAt: number;
      lastSeen: number;
    }
  >();

  for (const e of events) {
    const key = e.sessionId ?? `req-${e.id}`;
    const label = formatSessionLabel(key, e);
    const cur = map.get(key) ?? {
      label,
      source: e.source,
      models: new Map<string, number>(),
      requests: 0,
      input: 0,
      output: 0,
      cost: 0,
      estimated: true,
      startedAt: e.timestamp,
      lastSeen: e.timestamp
    };
    cur.requests += 1;
    cur.input += e.inputTokens;
    cur.output += e.outputTokens;
    cur.cost += estimateCost(e.model, e.inputTokens, e.outputTokens, e.cacheReadTokens);
    if (!e.estimated) {
      cur.estimated = false;
    }
    cur.startedAt = Math.min(cur.startedAt, e.timestamp);
    cur.lastSeen = Math.max(cur.lastSeen, e.timestamp);
    const model = e.model ?? 'unknown';
    cur.models.set(model, (cur.models.get(model) ?? 0) + 1);
    map.set(key, cur);
  }

  return [...map.entries()]
    .map(([id, v]) => {
      const topModel = [...v.models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return {
        id,
        label: v.label,
        source: v.source,
        model: topModel,
        requests: v.requests,
        inputTokens: v.input,
        outputTokens: v.output,
        totalTokens: v.input + v.output,
        cost: v.cost,
        estimated: v.estimated,
        startedAt: v.startedAt,
        lastSeen: v.lastSeen
      };
    })
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

function formatSessionLabel(sessionId: string, e: TokenEvent): string {
  if (sessionId.startsWith('otel-')) {
    return `Agent · ${sessionId.replace('otel-', '')}`;
  }
  if (sessionId.startsWith('log-')) {
    return sessionId.replace('log-', '').replace('panel/', 'Chat · ');
  }
  if (sessionId.length > 12) {
    return sessionId.slice(0, 8) + '…';
  }
  return e.source === 'claude'
    ? 'Claude Code'
    : e.source === 'antigravity'
      ? 'Antigravity CLI'
      : 'Copilot';
}

function buildDataQuality(
  events: TokenEvent[],
  estimated: number,
  real: number
): DataQuality {
  const total = events.length;
  let sourceLabel = 'Aucune source';
  let accuracyLabel = '—';

  if (real > 0 && estimated === 0) {
    sourceLabel = 'Logs API (réels)';
    accuracyLabel = '~95% précis';
  } else if (estimated > 0 && real === 0) {
    sourceLabel = 'Chat.log (estimé)';
    accuracyLabel = '~75–85% approx.';
  } else if (estimated > 0 && real > 0) {
    sourceLabel = 'Mixte réel + estimé';
    accuracyLabel = 'Variable';
  }

  return {
    totalRequests: total,
    estimatedRequests: estimated,
    realRequests: real,
    accuracyLabel,
    sourceLabel
  };
}

function buildDayCompare(events: TokenEvent[], now: number): PeriodCompare {
  const todayStart = periodStart('today', now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  const todayEv = events.filter((e) => e.timestamp >= todayStart);
  const yesterdayEv = events.filter(
    (e) => e.timestamp >= yesterdayStart && e.timestamp < todayStart
  );

  const sum = (ev: TokenEvent[]) => ({
    requests: ev.length,
    tokens: ev.reduce((s, e) => s + e.inputTokens + e.outputTokens + e.cacheReadTokens, 0),
    cost: ev.reduce(
      (s, e) => s + estimateCost(e.model, e.inputTokens, e.outputTokens, e.cacheReadTokens),
      0
    )
  });

  const cur = sum(todayEv);
  const prev = sum(yesterdayEv);
  const delta =
    prev.tokens > 0 ? Math.round(((cur.tokens - prev.tokens) / prev.tokens) * 100) : cur.tokens > 0 ? 100 : 0;

  return {
    currentLabel: "Aujourd'hui",
    previousLabel: 'Hier',
    currentRequests: cur.requests,
    previousRequests: prev.requests,
    currentTokens: cur.tokens,
    previousTokens: prev.tokens,
    currentCost: cur.cost,
    previousCost: prev.cost,
    tokenDeltaPct: delta
  };
}

function addEvent(stats: DayStats, e: TokenEvent): void {
  stats.inputTokens += e.inputTokens;
  stats.outputTokens += e.outputTokens;
  stats.cacheReadTokens += e.cacheReadTokens;
  const total = e.inputTokens + e.outputTokens + e.cacheReadTokens;
  stats.totalTokens += total;
  stats.cost += estimateCost(e.model, e.inputTokens, e.outputTokens, e.cacheReadTokens);
  stats.bySource[e.source] = (stats.bySource[e.source] ?? 0) + total;

  const model = e.model ?? 'unknown';
  const m = stats.byModel[model] ?? {
    input: 0,
    output: 0,
    cacheRead: 0,
    cost: 0,
    events: 0
  };
  m.input += e.inputTokens;
  m.output += e.outputTokens;
  m.cacheRead += e.cacheReadTokens;
  m.cost += estimateCost(e.model, e.inputTokens, e.outputTokens, e.cacheReadTokens);
  m.events += 1;
  stats.byModel[model] = m;
}
