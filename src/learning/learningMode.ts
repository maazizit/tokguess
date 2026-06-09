import * as vscode from 'vscode';

/**
 * Learning Mode - Adaptive token estimation
 * Learns from user patterns to improve estimation accuracy over time
 */

export interface EstimationRecord {
  timestamp: number;
  model: string;
  context: string; // panel/editAgent, panel/chat, etc.
  duration_ms: number;
  estimated_input: number;
  estimated_output: number;
  estimated_total: number;
  // If we ever get real tokens, store them here for learning
  actual_input?: number;
  actual_output?: number;
}

export interface UserProfile {
  total_estimations: number;
  avg_input_ratio: number; // User's typical input:output ratio
  avg_tokens_per_ms: Record<string, number>; // Model-specific rates
  context_multipliers: Record<string, number>; // Context-specific adjustments
  last_calibration: number;
}

export class LearningMode {
  private context: vscode.ExtensionContext;
  private historyKey = 'tokguess.learning.history';
  private profileKey = 'tokguess.learning.profile';
  private readonly maxHistorySize = 1000;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async recordEstimation(record: EstimationRecord): Promise<void> {
    const history = await this.getHistory();
    history.push(record);

    // Keep only recent records
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }

    await this.context.globalState.update(this.historyKey, history);

    // Recalibrate profile every 100 records
    if (history.length % 100 === 0) {
      await this.calibrateProfile();
    }
  }

  async getHistory(): Promise<EstimationRecord[]> {
    return this.context.globalState.get<EstimationRecord[]>(this.historyKey, []);
  }

  async getUserProfile(): Promise<UserProfile> {
    return this.context.globalState.get<UserProfile>(this.profileKey, {
      total_estimations: 0,
      avg_input_ratio: 8, // Default 8:1 input:output
      avg_tokens_per_ms: {},
      context_multipliers: {},
      last_calibration: 0
    });
  }

  async calibrateProfile(): Promise<void> {
    const history = await this.getHistory();
    if (history.length < 10) {
      return; // Need more data
    }

    const profile: UserProfile = {
      total_estimations: history.length,
      avg_input_ratio: 0,
      avg_tokens_per_ms: {},
      context_multipliers: {},
      last_calibration: Date.now()
    };

    // Calculate average input:output ratio
    const ratios = history
      .filter((r) => r.estimated_output > 0)
      .map((r) => r.estimated_input / r.estimated_output);

    if (ratios.length > 0) {
      profile.avg_input_ratio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    }

    // Calculate model-specific token generation rates
    const modelGroups = this.groupBy(history, 'model');
    for (const [model, records] of Object.entries(modelGroups)) {
      const rates = records.map((r) => r.estimated_output / r.duration_ms);
      profile.avg_tokens_per_ms[model] =
        rates.reduce((sum, r) => sum + r, 0) / rates.length;
    }

    // Calculate context-specific multipliers
    const contextGroups = this.groupBy(history, 'context');
    for (const [ctx, records] of Object.entries(contextGroups)) {
      const avgTokens = records.reduce((sum, r) => sum + r.estimated_total, 0) / records.length;
      const globalAvg = history.reduce((sum, r) => sum + r.estimated_total, 0) / history.length;
      profile.context_multipliers[ctx] = avgTokens / globalAvg;
    }

    await this.context.globalState.update(this.profileKey, profile);
  }

  async getAdaptiveEstimation(
    model: string,
    durationMs: number,
    context: string,
    baseEstimation: { input: number; output: number }
  ): Promise<{ input: number; output: number }> {
    const profile = await this.getUserProfile();

    if (profile.total_estimations < 50) {
      // Not enough data, use base estimation
      return baseEstimation;
    }

    // Apply user-specific adjustments
    let adjustedOutput = baseEstimation.output;

    // 1. Apply model-specific rate if learned
    if (profile.avg_tokens_per_ms[model]) {
      const learnedRate = profile.avg_tokens_per_ms[model];
      const learnedOutput = Math.ceil(durationMs * learnedRate);
      // Blend learned with base (70% learned, 30% base)
      adjustedOutput = Math.ceil(learnedOutput * 0.7 + baseEstimation.output * 0.3);
    }

    // 2. Apply context multiplier if learned
    if (profile.context_multipliers[context]) {
      adjustedOutput = Math.ceil(adjustedOutput * profile.context_multipliers[context]);
    }

    // 3. Apply user-specific input:output ratio
    const adjustedInput = Math.ceil(adjustedOutput * profile.avg_input_ratio);

    return {
      input: adjustedInput,
      output: adjustedOutput
    };
  }

  async getInsights(): Promise<string[]> {
    const profile = await this.getUserProfile();
    const history = await this.getHistory();

    if (history.length < 10) {
      return ['Collecting data... Need more estimations for insights.'];
    }

    const insights: string[] = [];

    // Insight 1: Most used context
    const contextGroups = this.groupBy(history.slice(-100), 'context');
    const topContext = Object.entries(contextGroups).sort(
      (a, b) => b[1].length - a[1].length
    )[0];
    if (topContext) {
      insights.push(
        `📊 Most used: ${topContext[0]} (${topContext[1].length} times in last 100 requests)`
      );
    }

    // Insight 2: Average response time
    const recentHistory = history.slice(-50);
    const avgDuration =
      recentHistory.reduce((sum, r) => sum + r.duration_ms, 0) / recentHistory.length;
    insights.push(`⏱️ Average response: ${Math.ceil(avgDuration)}ms`);

    // Insight 3: Token efficiency
    const avgTokensPerSec =
      recentHistory.reduce((sum, r) => sum + r.estimated_output / (r.duration_ms / 1000), 0) /
      recentHistory.length;
    insights.push(`⚡ Token generation: ${Math.ceil(avgTokensPerSec)} tokens/sec`);

    // Insight 4: Learning progress
    const accuracy = this.calculateAccuracy(profile);
    insights.push(
      `🎯 Estimation accuracy: ~${accuracy}% (based on ${profile.total_estimations} samples)`
    );

    // Insight 5: Input:output ratio trend
    if (profile.avg_input_ratio > 10) {
      insights.push(
        `💡 Tip: Your input:output ratio is ${profile.avg_input_ratio.toFixed(1)}:1 - consider more concise prompts`
      );
    }

    return insights;
  }

  private groupBy<T extends Record<string, any>>(
    array: T[],
    key: keyof T
  ): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const value = String(item[key]);
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private calculateAccuracy(profile: UserProfile): number {
    // Estimate accuracy based on calibration count and sample size
    const baseAccuracy = 75; // Base formula accuracy
    const learningBonus = Math.min(7, Math.floor(profile.total_estimations / 100));
    return Math.min(95, baseAccuracy + learningBonus);
  }

  async resetLearning(): Promise<void> {
    await this.context.globalState.update(this.historyKey, []);
    await this.context.globalState.update(this.profileKey, undefined);
  }
}
