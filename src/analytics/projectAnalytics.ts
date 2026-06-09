import * as vscode from 'vscode';
import { TokenEvent } from '../types';

/**
 * Project Analytics - Track usage patterns and trends
 * Provides insights on costs, model distribution, peak hours, etc.
 */

export interface DayStats {
  date: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  requests: number;
  models: Record<string, number>;
}

export interface ProjectAnalytics {
  // Overall stats
  total_tokens: number;
  total_cost: number;
  total_requests: number;
  period_days: number;

  // Averages
  avg_tokens_per_day: number;
  avg_cost_per_day: number;
  avg_tokens_per_request: number;

  // Distribution
  model_distribution: { model: string; tokens: number; cost: number; percent: number }[];
  context_distribution: { context: string; count: number; percent: number }[];

  // Trends
  daily_stats: DayStats[];
  trend: 'increasing' | 'stable' | 'decreasing';
  trend_percent: number;

  // Peak hours
  peak_hours: { hour: number; tokens: number }[];

  // Budget projection
  projected_monthly_cost: number;
  budget_risk: 'low' | 'medium' | 'high';

  // Top files
  top_files?: { file: string; tokens: number }[];
}

export class ProjectAnalyticsEngine {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async analyzeProject(events: TokenEvent[], periodDays: number = 30): Promise<ProjectAnalytics> {
    const cutoffDate = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    const filteredEvents = events.filter((e) => e.timestamp >= cutoffDate);

    if (filteredEvents.length === 0) {
      return this.getEmptyAnalytics();
    }

    // Calculate totals
    const totalTokens = filteredEvents.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens,
      0
    );
    const totalCost = filteredEvents.reduce((sum, e) => sum + this.calculateCost(e), 0);
    const totalRequests = filteredEvents.length;

    // Calculate averages
    const avgTokensPerDay = totalTokens / periodDays;
    const avgCostPerDay = totalCost / periodDays;
    const avgTokensPerRequest = totalTokens / totalRequests;

    // Model distribution
    const modelGroups = this.groupBy(filteredEvents, 'model');
    const modelDistribution = Object.entries(modelGroups)
      .map(([model, events]) => {
        const tokens = events.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
        const cost = events.reduce((sum, e) => sum + this.calculateCost(e), 0);
        return {
          model: model || 'unknown',
          tokens,
          cost,
          percent: (tokens / totalTokens) * 100
        };
      })
      .sort((a, b) => b.tokens - a.tokens);

    // Context distribution
    const contextGroups = this.groupBy(
      filteredEvents.filter((e) => e.sessionId),
      'sessionId'
    );
    const contextDistribution = Object.entries(contextGroups)
      .map(([context, events]) => ({
        context: context || 'unknown',
        count: events.length,
        percent: (events.length / totalRequests) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Daily stats
    const dailyGroups = this.groupByDay(filteredEvents);
    const dailyStats: DayStats[] = Object.entries(dailyGroups).map(([date, events]) => ({
      date,
      tokens_input: events.reduce((sum, e) => sum + e.inputTokens, 0),
      tokens_output: events.reduce((sum, e) => sum + e.outputTokens, 0),
      cost_usd: events.reduce((sum, e) => sum + this.calculateCost(e), 0),
      requests: events.length,
      models: Object.entries(this.groupBy(events, 'model')).reduce(
        (acc: Record<string, number>, [model, evts]: [string, TokenEvent[]]) => {
          acc[model] = evts.length;
          return acc;
        },
        {} as Record<string, number>
      )
    }));

    // Trend analysis
    const { trend, trendPercent } = this.analyzeTrend(dailyStats);

    // Peak hours
    const hourGroups = this.groupByHour(filteredEvents);
    const peakHours = Object.entries(hourGroups)
      .map(([hour, events]) => ({
        hour: parseInt(hour),
        tokens: events.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);

    // Budget projection
    const dayOfMonth = new Date().getDate();
    const projectedMonthlyCost = (totalCost / periodDays) * 30;
    const budgetRisk = this.assessBudgetRisk(projectedMonthlyCost);

    return {
      total_tokens: totalTokens,
      total_cost: totalCost,
      total_requests: totalRequests,
      period_days: periodDays,
      avg_tokens_per_day: avgTokensPerDay,
      avg_cost_per_day: avgCostPerDay,
      avg_tokens_per_request: avgTokensPerRequest,
      model_distribution: modelDistribution,
      context_distribution: contextDistribution,
      daily_stats: dailyStats,
      trend,
      trend_percent: trendPercent,
      peak_hours: peakHours,
      projected_monthly_cost: projectedMonthlyCost,
      budget_risk: budgetRisk
    };
  }

  async generateInsights(analytics: ProjectAnalytics): Promise<string[]> {
    const insights: string[] = [];

    // Most used model
    if (analytics.model_distribution.length > 0) {
      const topModel = analytics.model_distribution[0];
      insights.push(
        `🎯 Most used: ${topModel.model} (${topModel.percent.toFixed(0)}% of usage, $${topModel.cost.toFixed(2)})`
      );
    }

    // Cost trend
    if (analytics.trend === 'increasing') {
      insights.push(
        `📈 Usage increasing by ${analytics.trend_percent.toFixed(0)}% - monitor budget closely`
      );
    } else if (analytics.trend === 'decreasing') {
      insights.push(`📉 Usage decreasing by ${analytics.trend_percent.toFixed(0)}% - great job!`);
    } else {
      insights.push(`📊 Usage stable (~${analytics.trend_percent.toFixed(0)}% variance)`);
    }

    // Peak hours
    if (analytics.peak_hours.length > 0) {
      const peakHour = analytics.peak_hours[0];
      insights.push(
        `⏰ Peak usage: ${peakHour.hour}:00-${peakHour.hour + 1}:00 (${peakHour.tokens.toLocaleString()} tokens)`
      );
    }

    // Budget projection
    if (analytics.budget_risk === 'high') {
      insights.push(
        `⚠️ High budget risk! Projected: $${analytics.projected_monthly_cost.toFixed(2)}/month`
      );
    } else if (analytics.budget_risk === 'medium') {
      insights.push(
        `🟡 Moderate budget: $${analytics.projected_monthly_cost.toFixed(2)}/month projected`
      );
    } else {
      insights.push(
        `✅ Budget on track: $${analytics.projected_monthly_cost.toFixed(2)}/month projected`
      );
    }

    // Cost efficiency suggestions
    const expensiveModels = analytics.model_distribution.filter((m) =>
      m.model.toLowerCase().includes('gpt-4o') && !m.model.includes('mini')
    );
    if (expensiveModels.length > 0 && expensiveModels[0].percent > 30) {
      insights.push(
        `💡 Tip: ${expensiveModels[0].percent.toFixed(0)}% usage is GPT-4o - consider GPT-4o-mini for drafts to save 60% cost`
      );
    }

    return insights;
  }

  async exportAnalytics(analytics: ProjectAnalytics, format: 'json' | 'csv'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(analytics, null, 2);
    }

    // CSV format
    const lines = ['Date,Tokens Input,Tokens Output,Cost USD,Requests'];

    for (const day of analytics.daily_stats) {
      lines.push(
        `${day.date},${day.tokens_input},${day.tokens_output},${day.cost_usd.toFixed(4)},${day.requests}`
      );
    }

    return lines.join('\n');
  }

  private calculateCost(event: TokenEvent): number {
    const model = (event.model || '').toLowerCase();

    // Pricing per 1M tokens (June 2026 rates)
    let inputCost = 0.01; // Default $0.01/1M
    let outputCost = 0.03;
    let cacheCost = 0.001;

    if (model.includes('gpt-4o-mini')) {
      inputCost = 0.15;
      outputCost = 0.6;
    } else if (model.includes('gpt-4o')) {
      inputCost = 2.5;
      outputCost = 10;
    } else if (model.includes('claude-sonnet')) {
      inputCost = 3;
      outputCost = 15;
      cacheCost = 0.3;
    } else if (model.includes('claude-opus')) {
      inputCost = 15;
      outputCost = 75;
      cacheCost = 1.5;
    } else if (model.includes('claude-haiku')) {
      inputCost = 0.25;
      outputCost = 1.25;
      cacheCost = 0.025;
    }

    const input = (event.inputTokens * inputCost) / 1_000_000;
    const output = (event.outputTokens * outputCost) / 1_000_000;
    const cache = (event.cacheReadTokens * cacheCost) / 1_000_000;

    return input + output + cache;
  }

  private groupBy<T extends Record<string, any>>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const value = String(item[key] || 'unknown');
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private groupByDay(events: TokenEvent[]): Record<string, TokenEvent[]> {
    return events.reduce((groups, event) => {
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(event);
      return groups;
    }, {} as Record<string, TokenEvent[]>);
  }

  private groupByHour(events: TokenEvent[]): Record<string, TokenEvent[]> {
    return events.reduce((groups, event) => {
      const hour = new Date(event.timestamp).getHours().toString();
      if (!groups[hour]) {
        groups[hour] = [];
      }
      groups[hour].push(event);
      return groups;
    }, {} as Record<string, TokenEvent[]>);
  }

  private analyzeTrend(dailyStats: DayStats[]): { trend: 'increasing' | 'stable' | 'decreasing'; trendPercent: number } {
    if (dailyStats.length < 7) {
      return { trend: 'stable', trendPercent: 0 };
    }

    const recent = dailyStats.slice(-7);
    const previous = dailyStats.slice(-14, -7);

    const recentAvg = recent.reduce((sum, d) => sum + d.tokens_input + d.tokens_output, 0) / 7;
    const previousAvg =
      previous.reduce((sum, d) => sum + d.tokens_input + d.tokens_output, 0) / 7;

    const change = ((recentAvg - previousAvg) / previousAvg) * 100;

    if (change > 10) {
      return { trend: 'increasing', trendPercent: change };
    } else if (change < -10) {
      return { trend: 'decreasing', trendPercent: Math.abs(change) };
    } else {
      return { trend: 'stable', trendPercent: Math.abs(change) };
    }
  }

  private assessBudgetRisk(projectedCost: number): 'low' | 'medium' | 'high' {
    const config = vscode.workspace.getConfiguration('tokguess.budget');
    const monthlyBudget = config.get<number>('monthly_cost_usd', 20);

    const percent = (projectedCost / monthlyBudget) * 100;

    if (percent >= 90) {
      return 'high';
    } else if (percent >= 75) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private getEmptyAnalytics(): ProjectAnalytics {
    return {
      total_tokens: 0,
      total_cost: 0,
      total_requests: 0,
      period_days: 0,
      avg_tokens_per_day: 0,
      avg_cost_per_day: 0,
      avg_tokens_per_request: 0,
      model_distribution: [],
      context_distribution: [],
      daily_stats: [],
      trend: 'stable',
      trend_percent: 0,
      peak_hours: [],
      projected_monthly_cost: 0,
      budget_risk: 'low'
    };
  }
}
