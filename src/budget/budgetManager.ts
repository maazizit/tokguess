import * as vscode from 'vscode';

/**
 * Multi-level budget configuration
 * Supports: monthly cost, daily tokens, per-file limits, project-specific
 */
export interface BudgetConfig {
  // Primary limits
  monthly_cost_usd: number;
  daily_tokens: number;
  per_file_tokens: number;
  per_session_tokens: number;

  // Alert thresholds
  warn_at_percent: number; // 75
  critical_at_percent: number; // 90
  block_at_percent: number; // 100

  // Behavior
  hard_limit: boolean; // Block requests if exceeded?
  show_warnings: boolean;
  show_suggestions: boolean;

  // Project-specific (workspace)
  workspace_specific: boolean;
}

export interface BudgetStatus {
  type: 'ok' | 'warn' | 'critical' | 'over';
  current: number;
  limit: number;
  percent: number;
  message: string;
  suggestions?: string[];
}

export class BudgetManager {
  private config: vscode.WorkspaceConfiguration;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.config = vscode.workspace.getConfiguration('tokguess.budget');
  }

  getBudgetConfig(): BudgetConfig {
    return {
      monthly_cost_usd: this.config.get('monthly_cost_usd', 20),
      daily_tokens: this.config.get('daily_tokens', 50000),
      per_file_tokens: this.config.get('per_file_tokens', 5000),
      per_session_tokens: this.config.get('per_session_tokens', 15000),
      warn_at_percent: this.config.get('warn_at_percent', 75),
      critical_at_percent: this.config.get('critical_at_percent', 90),
      block_at_percent: this.config.get('block_at_percent', 100),
      hard_limit: this.config.get('hard_limit', false),
      show_warnings: this.config.get('show_warnings', true),
      show_suggestions: this.config.get('show_suggestions', true),
      workspace_specific: this.config.get('workspace_specific', false)
    };
  }

  checkDailyBudget(tokensToday: number): BudgetStatus {
    const budget = this.getBudgetConfig();
    const percent = (tokensToday / budget.daily_tokens) * 100;

    if (percent >= budget.block_at_percent) {
      return {
        type: 'over',
        current: tokensToday,
        limit: budget.daily_tokens,
        percent,
        message: `🔴 Daily budget exceeded! ${tokensToday.toLocaleString()}/${budget.daily_tokens.toLocaleString()} tokens`,
        suggestions: [
          'Wait until tomorrow for reset',
          'Increase daily budget in settings',
          'Use GPT-4o-mini for remaining tasks'
        ]
      };
    }

    if (percent >= budget.critical_at_percent) {
      return {
        type: 'critical',
        current: tokensToday,
        limit: budget.daily_tokens,
        percent,
        message: `⚠️ Critical: ${percent.toFixed(0)}% daily budget used`,
        suggestions: ['Consider switching to lighter model', 'Review context size']
      };
    }

    if (percent >= budget.warn_at_percent) {
      return {
        type: 'warn',
        current: tokensToday,
        limit: budget.daily_tokens,
        percent,
        message: `🟡 Warning: ${percent.toFixed(0)}% daily budget used`,
        suggestions: ['Monitor usage closely']
      };
    }

    return {
      type: 'ok',
      current: tokensToday,
      limit: budget.daily_tokens,
      percent,
      message: `✅ Daily budget: ${percent.toFixed(0)}% used`
    };
  }

  checkFileBudget(fileTokens: number, fileName: string): BudgetStatus {
    const budget = this.getBudgetConfig();
    const percent = (fileTokens / budget.per_file_tokens) * 100;

    if (percent >= 100) {
      return {
        type: 'over',
        current: fileTokens,
        limit: budget.per_file_tokens,
        percent,
        message: `🔴 File too large: ${fileName}`,
        suggestions: [
          'Split file into smaller modules',
          'Use selection instead of full file',
          'Remove comments/imports before sending'
        ]
      };
    }

    if (percent >= budget.warn_at_percent) {
      return {
        type: 'warn',
        current: fileTokens,
        limit: budget.per_file_tokens,
        percent,
        message: `⚠️ Large file: ${fileName} (${fileTokens.toLocaleString()} tokens)`,
        suggestions: ['Consider context optimization']
      };
    }

    return {
      type: 'ok',
      current: fileTokens,
      limit: budget.per_file_tokens,
      percent,
      message: `✅ File size OK`
    };
  }

  async checkMonthlyCost(costThisMonth: number): Promise<BudgetStatus> {
    const budget = this.getBudgetConfig();
    const percent = (costThisMonth / budget.monthly_cost_usd) * 100;

    if (percent >= budget.block_at_percent) {
      return {
        type: 'over',
        current: costThisMonth,
        limit: budget.monthly_cost_usd,
        percent,
        message: `🔴 Monthly budget exceeded! $${costThisMonth.toFixed(2)}/$${budget.monthly_cost_usd}`,
        suggestions: [
          'Wait for next month reset',
          'Increase monthly budget',
          'Switch to free tier models'
        ]
      };
    }

    if (percent >= budget.critical_at_percent) {
      return {
        type: 'critical',
        current: costThisMonth,
        limit: budget.monthly_cost_usd,
        percent,
        message: `⚠️ ${percent.toFixed(0)}% monthly budget used`,
        suggestions: [
          `$${(budget.monthly_cost_usd - costThisMonth).toFixed(2)} remaining`,
          'Optimize context usage'
        ]
      };
    }

    if (percent >= budget.warn_at_percent) {
      return {
        type: 'warn',
        current: costThisMonth,
        limit: budget.monthly_cost_usd,
        percent,
        message: `🟡 ${percent.toFixed(0)}% monthly budget used`,
        suggestions: ['On track for monthly limit']
      };
    }

    return {
      type: 'ok',
      current: costThisMonth,
      limit: budget.monthly_cost_usd,
      percent,
      message: `✅ Monthly: $${costThisMonth.toFixed(2)}/$${budget.monthly_cost_usd}`
    };
  }

  async showBudgetAlert(status: BudgetStatus): Promise<void> {
    const budget = this.getBudgetConfig();
    if (!budget.show_warnings) {
      return;
    }

    const actions = status.suggestions || [];
    const action = await vscode.window.showWarningMessage(status.message, ...actions, 'Settings');

    if (action === 'Settings') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'tokguess.budget');
    }
  }

  getProjectedMonthlyCost(currentCost: number, dayOfMonth: number): number {
    const daysInMonth = 30;
    const dailyAvg = currentCost / dayOfMonth;
    return dailyAvg * daysInMonth;
  }
}
