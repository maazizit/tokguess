import * as vscode from 'vscode';
import { estimateCost } from '../pricing';
import { DashboardPayload, DayStats, TokenEvent, TokenSource } from '../types';

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

  getEvents(): TokenEvent[] {
    return [...this.events];
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

    const grand = [...modelTotals.values()].reduce((s, m) => s + m.tokens, 0) || 1;
    const topModels = [...modelTotals.entries()]
      .map(([model, v]) => ({
        model,
        tokens: v.tokens,
        cost: v.cost,
        pct: Math.round((v.tokens / grand) * 100)
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 6);

    const sessionMap = new Map<
      string,
      { source: TokenSource; tokens: number; cost: number; lastSeen: number }
    >();
    for (const e of inPeriod) {
      if (!e.sessionId) {
        continue;
      }
      const total = e.inputTokens + e.outputTokens;
      const cost = estimateCost(e.model, e.inputTokens, e.outputTokens, e.cacheReadTokens);
      const cur = sessionMap.get(e.sessionId) ?? {
        source: e.source,
        tokens: 0,
        cost: 0,
        lastSeen: 0
      };
      cur.tokens += total;
      cur.cost += cost;
      cur.lastSeen = Math.max(cur.lastSeen, e.timestamp);
      sessionMap.set(e.sessionId, cur);
    }

    const recentSessions = [...sessionMap.entries()]
      .map(([sessionId, v]) => ({ sessionId: sessionId.slice(0, 8), ...v }))
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 8);

    const lastIngest = this.events.length
      ? Math.max(...this.events.map((e) => e.timestamp))
      : null;

    return {
      today,
      period: periodStats,
      periodLabel: period,
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
    bySource: { copilot: 0, claude: 0, estimate: 0 },
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
    bySource: { copilot: 0, claude: 0, estimate: 0 },
    hourly: Array.from({ length: 24 }, () => 0)
  };
  for (const e of events) {
    addEvent(stats, e);
  }
  return stats;
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
