import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { UsageStore } from '../storage/usageStore';
import { TokenEvent, DayStats } from '../types';
import { formatCost } from '../pricing';

export type ExportFormat = 'csv' | 'json' | 'markdown';
export type ExportPeriod = 'today' | '7d' | '30d' | 'all';

interface ExportOptions {
  format: ExportFormat;
  period: ExportPeriod;
  includeModelBreakdown: boolean;
  includeFileHeatmap: boolean;
  includeCostAnalysis: boolean;
}

interface ExportData {
  metadata: {
    generatedAt: string;
    period: ExportPeriod;
    startDate: string;
    endDate: string;
    totalTokens: number;
    totalCost: number;
    totalRequests: number;
  };
  events: TokenEvent[];
  dailyStats: DayStats[];
  modelBreakdown: Array<{
    model: string;
    tokens: number;
    cost: number;
    requests: number;
    percentage: number;
  }>;
  topFiles?: Array<{
    file: string;
    tokens: number;
    cost: number;
  }>;
}

/**
 * Advanced export functionality for token usage reports
 */
export class ReportExporter {
  constructor(private readonly store: UsageStore) {}

  /**
   * Show export dialog and export report
   */
  async exportReport(): Promise<void> {
    // Step 1: Choose format
    const format = await vscode.window.showQuickPick(
      [
        {
          label: '$(file-text) CSV',
          description: 'Excel-ready spreadsheet',
          value: 'csv' as ExportFormat
        },
        {
          label: '$(json) JSON',
          description: 'API/analysis format',
          value: 'json' as ExportFormat
        },
        {
          label: '$(markdown) Markdown',
          description: 'Human-readable report',
          value: 'markdown' as ExportFormat
        }
      ],
      { placeHolder: 'Select export format' }
    );

    if (!format) {
      return;
    }

    // Step 2: Choose period
    const period = await vscode.window.showQuickPick(
      [
        { label: 'Today', description: 'Current day only', value: 'today' as ExportPeriod },
        { label: 'Last 7 days', description: 'Past week', value: '7d' as ExportPeriod },
        { label: 'Last 30 days', description: 'Past month', value: '30d' as ExportPeriod },
        { label: 'All time', description: 'Complete history', value: 'all' as ExportPeriod }
      ],
      { placeHolder: 'Select time period' }
    );

    if (!period) {
      return;
    }

    // Step 3: Choose options (multi-select)
    const options = await vscode.window.showQuickPick(
      [
        {
          label: 'Include model breakdown',
          description: 'Tokens & cost per model',
          picked: true,
          value: 'modelBreakdown'
        },
        {
          label: 'Include file heatmap',
          description: 'Top files by usage',
          picked: true,
          value: 'fileHeatmap'
        },
        {
          label: 'Include cost analysis',
          description: 'Detailed cost breakdown',
          picked: true,
          value: 'costAnalysis'
        }
      ],
      { canPickMany: true, placeHolder: 'Select report options' }
    );

    if (!options) {
      return;
    }

    const exportOptions: ExportOptions = {
      format: format.value,
      period: period.value,
      includeModelBreakdown: options.some((o) => o.value === 'modelBreakdown'),
      includeFileHeatmap: options.some((o) => o.value === 'fileHeatmap'),
      includeCostAnalysis: options.some((o) => o.value === 'costAnalysis')
    };

    // Step 4: Choose save location
    const defaultFileName = `tokguess-report-${period.value}-${Date.now()}.${format.value}`;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', defaultFileName)
      ),
      filters: this.getFilters(format.value)
    });

    if (!uri) {
      return;
    }

    // Generate and save report
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting TokGuess Report',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: 'Gathering data...' });
        const data = this.gatherExportData(exportOptions);

        progress.report({ message: 'Formatting report...' });
        const content = this.formatReport(data, exportOptions);

        progress.report({ message: 'Writing file...' });
        fs.writeFileSync(uri.fsPath, content, 'utf-8');

        void vscode.window
          .showInformationMessage(`✅ Report exported: ${path.basename(uri.fsPath)}`, 'Open File')
          .then((action) => {
            if (action === 'Open File') {
              void vscode.commands.executeCommand('vscode.open', uri);
            }
          });
      }
    );
  }

  /**
   * Gather data for export
   */
  private gatherExportData(options: ExportOptions): ExportData {
    const allEvents = this.store.getEvents();
    const now = Date.now();

    // Filter by period
    let startTime = 0;
    switch (options.period) {
      case 'today':
        startTime = new Date().setHours(0, 0, 0, 0);
        break;
      case '7d':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'all':
        startTime = 0;
        break;
    }

    const filteredEvents = allEvents.filter((e: TokenEvent) => e.timestamp >= startTime);

    // Build daily stats
    const dailyMap = new Map<string, DayStats>();
    let totalTokens = 0;
    let totalCost = 0;

    for (const event of filteredEvents) {
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          date,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          cost: 0,
          events: 0,
          byModel: {},
          bySource: { copilot: 0, claude: 0, antigravity: 0, estimate: 0 },
          hourly: new Array(24).fill(0)
        });
      }

      const day = dailyMap.get(date)!;
      day.inputTokens += event.inputTokens;
      day.outputTokens += event.outputTokens;
      day.cacheReadTokens += event.cacheReadTokens;
      day.totalTokens += event.inputTokens + event.outputTokens;
      day.events++;

      totalTokens += event.inputTokens + event.outputTokens;
      // Cost calculation (simplified - use pricing from store)
      totalCost += (event.inputTokens + event.outputTokens) * 0.00001;
    }

    const dailyStats = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Model breakdown
    const modelMap = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const event of filteredEvents) {
      const model = event.model || 'unknown';
      if (!modelMap.has(model)) {
        modelMap.set(model, { tokens: 0, cost: 0, requests: 0 });
      }
      const stats = modelMap.get(model)!;
      stats.tokens += event.inputTokens + event.outputTokens;
      stats.cost += (event.inputTokens + event.outputTokens) * 0.00001;
      stats.requests++;
    }

    const modelBreakdown = Array.from(modelMap.entries())
      .map(([model, stats]) => ({
        model,
        tokens: stats.tokens,
        cost: stats.cost,
        requests: stats.requests,
        percentage: totalTokens > 0 ? (stats.tokens / totalTokens) * 100 : 0
      }))
      .sort((a, b) => b.tokens - a.tokens);

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        period: options.period,
        startDate: dailyStats[0]?.date || new Date().toISOString().split('T')[0],
        endDate: dailyStats[dailyStats.length - 1]?.date || new Date().toISOString().split('T')[0],
        totalTokens,
        totalCost,
        totalRequests: filteredEvents.length
      },
      events: filteredEvents,
      dailyStats,
      modelBreakdown
    };
  }

  /**
   * Format report based on export format
   */
  private formatReport(data: ExportData, options: ExportOptions): string {
    switch (options.format) {
      case 'csv':
        return this.formatCSV(data, options);
      case 'json':
        return this.formatJSON(data, options);
      case 'markdown':
        return this.formatMarkdown(data, options);
    }
  }

  /**
   * Format as CSV
   */
  private formatCSV(data: ExportData, options: ExportOptions): string {
    const lines: string[] = [];

    // Header
    lines.push('Date,Model,Source,Session,Input_Tokens,Output_Tokens,Cache_Read,Total_Tokens,Cost_USD,Estimated');

    // Events
    for (const event of data.events) {
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      const cost = (event.inputTokens + event.outputTokens) * 0.00001;
      lines.push(
        [
          date,
          event.model || 'unknown',
          event.source,
          event.sessionId || '',
          event.inputTokens,
          event.outputTokens,
          event.cacheReadTokens,
          event.inputTokens + event.outputTokens,
          cost.toFixed(4),
          event.estimated ? 'yes' : 'no'
        ].join(',')
      );
    }

    // Summary section
    if (options.includeModelBreakdown) {
      lines.push('');
      lines.push('Model Breakdown');
      lines.push('Model,Tokens,Cost_USD,Requests,Percentage');
      for (const model of data.modelBreakdown) {
        lines.push(
          [
            model.model,
            model.tokens,
            model.cost.toFixed(4),
            model.requests,
            model.percentage.toFixed(1) + '%'
          ].join(',')
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatJSON(data: ExportData, _options: ExportOptions): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format as Markdown
   */
  private formatMarkdown(data: ExportData, options: ExportOptions): string {
    const lines: string[] = [];

    // Title
    lines.push(`# TokGuess Token Usage Report`);
    lines.push('');
    lines.push(`**Generated:** ${new Date(data.metadata.generatedAt).toLocaleString()}`);
    lines.push(`**Period:** ${options.period.toUpperCase()}`);
    lines.push(`**Date Range:** ${data.metadata.startDate} to ${data.metadata.endDate}`);
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`- **Total Tokens:** ${data.metadata.totalTokens.toLocaleString()}`);
    lines.push(`- **Total Cost:** ${formatCost(data.metadata.totalCost)}`);
    lines.push(`- **Total Requests:** ${data.metadata.totalRequests.toLocaleString()}`);
    lines.push(`- **Daily Average:** ${Math.round(data.metadata.totalTokens / data.dailyStats.length).toLocaleString()} tokens`);
    lines.push('');

    // Model Breakdown
    if (options.includeModelBreakdown && data.modelBreakdown.length > 0) {
      lines.push('## Model Distribution');
      lines.push('');
      lines.push('| Model | Tokens | Cost | Requests | Percentage |');
      lines.push('|-------|--------|------|----------|------------|');
      for (const model of data.modelBreakdown) {
        lines.push(
          `| ${model.model} | ${model.tokens.toLocaleString()} | ${formatCost(model.cost)} | ${model.requests} | ${model.percentage.toFixed(1)}% |`
        );
      }
      lines.push('');
    }

    // Daily Stats
    lines.push('## Daily Usage');
    lines.push('');
    lines.push('| Date | Tokens | Cost | Requests |');
    lines.push('|------|--------|------|----------|');
    for (const day of data.dailyStats) {
      lines.push(
        `| ${day.date} | ${day.totalTokens.toLocaleString()} | ${formatCost(day.cost)} | ${day.events} |`
      );
    }
    lines.push('');

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Generated by TokGuess — Token usage tracking for VS Code*');

    return lines.join('\n');
  }

  /**
   * Get file filters for save dialog
   */
  private getFilters(format: ExportFormat): Record<string, string[]> {
    switch (format) {
      case 'csv':
        return { 'CSV Files': ['csv'] };
      case 'json':
        return { 'JSON Files': ['json'] };
      case 'markdown':
        return { 'Markdown Files': ['md'] };
    }
  }
}
