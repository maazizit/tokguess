import * as vscode from 'vscode';
import { estimateTokensFromText } from '../estimator';

interface CachedContext {
  context: string;
  timestamp: number;
  inputTokens: number;
  hash: string;
}

interface CachePrediction {
  cacheHitLikely: boolean;
  cachedTokens: number;
  savedCost: number;
  similarity: number;
  matchedContext?: CachedContext;
}

/**
 * Detects and predicts Anthropic cache usage to estimate real costs
 * 
 * Anthropic's prompt caching reduces input token costs by ~90% when
 * similar contexts are sent within a 5-minute window.
 */
export class CacheDetector {
  private recentContexts: CachedContext[] = [];
  private readonly CACHE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (conservative)
  private readonly MIN_SIMILARITY = 0.7; // 70% similarity threshold
  private readonly CACHE_COST_MULTIPLIER = 0.1; // Cache is 90% cheaper
  private readonly MIN_CACHE_TOKENS = 512; // Minimum tokens for cache to apply

  constructor(private readonly context: vscode.ExtensionContext) {
    // Load recent contexts from storage
    this.loadContexts();

    // Clean old contexts every minute
    setInterval(() => this.cleanOldContexts(), 60 * 1000);
  }

  /**
   * Predict cache usage for given context
   */
  predictCacheUsage(currentContext: string, model?: string): CachePrediction {
    // Only apply to Claude models
    if (model && !model.toLowerCase().includes('claude')) {
      return {
        cacheHitLikely: false,
        cachedTokens: 0,
        savedCost: 0,
        similarity: 0
      };
    }

    const currentTokens = estimateTokensFromText(currentContext);

    // Cache only applies to larger contexts
    if (currentTokens < this.MIN_CACHE_TOKENS) {
      return {
        cacheHitLikely: false,
        cachedTokens: 0,
        savedCost: 0,
        similarity: 0
      };
    }

    const currentHash = this.hashContext(currentContext);

    // Check recent contexts for similarity
    const now = Date.now();
    for (const cached of this.recentContexts) {
      // Skip if outside cache window
      if (now - cached.timestamp > this.CACHE_WINDOW_MS) {
        continue;
      }

      // Quick hash check first
      if (cached.hash === currentHash) {
        // Exact match
        return this.buildPrediction(cached, currentTokens, 1.0);
      }

      // Calculate similarity
      const similarity = this.calculateSimilarity(currentContext, cached.context);

      if (similarity >= this.MIN_SIMILARITY) {
        // Probable cache hit
        return this.buildPrediction(cached, currentTokens, similarity);
      }
    }

    // No cache hit - record this context
    this.recordContext(currentContext, currentTokens, currentHash);

    return {
      cacheHitLikely: false,
      cachedTokens: 0,
      savedCost: 0,
      similarity: 0
    };
  }

  /**
   * Show cache usage notification
   */
  showCacheNotification(prediction: CachePrediction): void {
    if (!prediction.cacheHitLikely) {
      return;
    }

    const message =
      `💰 Cache detected! ~${prediction.cachedTokens.toLocaleString()} tokens ` +
      `cached → save ${this.formatCost(prediction.savedCost)} ` +
      `(${Math.round(prediction.similarity * 100)}% similarity)`;

    void vscode.window.showInformationMessage(message);
  }

  /**
   * Build cache prediction result
   */
  private buildPrediction(
    cached: CachedContext,
    currentTokens: number,
    similarity: number
  ): CachePrediction {
    // Estimate cached tokens (proportional to similarity)
    const cachedTokens = Math.floor(cached.inputTokens * similarity);

    // Calculate cost savings (90% off cached tokens)
    // Assume $3/M input tokens (Claude Sonnet pricing)
    const normalCost = (cachedTokens / 1_000_000) * 3;
    const cachedCost = normalCost * this.CACHE_COST_MULTIPLIER;
    const savedCost = normalCost - cachedCost;

    return {
      cacheHitLikely: true,
      cachedTokens,
      savedCost,
      similarity,
      matchedContext: cached
    };
  }

  /**
   * Record context for future cache detection
   */
  private recordContext(context: string, inputTokens: number, hash: string): void {
    // Limit stored contexts to prevent memory bloat
    if (this.recentContexts.length > 50) {
      this.recentContexts.shift();
    }

    this.recentContexts.push({
      context: this.truncateContext(context),
      timestamp: Date.now(),
      inputTokens,
      hash
    });

    // Persist to storage
    void this.saveContexts();
  }

  /**
   * Calculate similarity between two contexts using Jaccard index
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // Use word-level n-grams for better accuracy
    const ngrams1 = this.extractNgrams(text1, 3);
    const ngrams2 = this.extractNgrams(text2, 3);

    const set1 = new Set(ngrams1);
    const set2 = new Set(ngrams2);

    // Jaccard similarity
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Extract n-grams from text
   */
  private extractNgrams(text: string, n: number): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    const ngrams: string[] = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }

    return ngrams;
  }

  /**
   * Hash context for quick comparison
   */
  private hashContext(text: string): string {
    // Simple hash for quick comparison
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Truncate context to save storage (keep first/last chunks)
   */
  private truncateContext(context: string, maxLength = 5000): string {
    if (context.length <= maxLength) {
      return context;
    }

    // Keep first and last portions
    const chunkSize = Math.floor(maxLength / 2);
    return context.slice(0, chunkSize) + '...' + context.slice(-chunkSize);
  }

  /**
   * Clean contexts outside cache window
   */
  private cleanOldContexts(): void {
    const now = Date.now();
    const cutoff = now - this.CACHE_WINDOW_MS;

    this.recentContexts = this.recentContexts.filter((ctx) => ctx.timestamp > cutoff);

    // Persist cleaned list
    void this.saveContexts();
  }

  /**
   * Load cached contexts from storage
   */
  private loadContexts(): void {
    try {
      const stored = this.context.globalState.get<CachedContext[]>('tokguess.cachedContexts');
      if (stored) {
        this.recentContexts = stored;
        // Clean on load
        this.cleanOldContexts();
      }
    } catch (error) {
      console.error('Failed to load cached contexts:', error);
      this.recentContexts = [];
    }
  }

  /**
   * Save cached contexts to storage
   */
  private async saveContexts(): Promise<void> {
    try {
      await this.context.globalState.update('tokguess.cachedContexts', this.recentContexts);
    } catch (error) {
      console.error('Failed to save cached contexts:', error);
    }
  }

  /**
   * Format cost for display
   */
  private formatCost(cost: number): string {
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
  }

  /**
   * Clear all cached contexts (for testing/reset)
   */
  clear(): void {
    this.recentContexts = [];
    void this.saveContexts();
  }

  /**
   * Get stats about cached contexts
   */
  getStats(): {
    totalContexts: number;
    oldestTimestamp: number | null;
    avgTokens: number;
  } {
    if (this.recentContexts.length === 0) {
      return { totalContexts: 0, oldestTimestamp: null, avgTokens: 0 };
    }

    const oldest = Math.min(...this.recentContexts.map((c) => c.timestamp));
    const avgTokens =
      this.recentContexts.reduce((sum, c) => sum + c.inputTokens, 0) / this.recentContexts.length;

    return {
      totalContexts: this.recentContexts.length,
      oldestTimestamp: oldest,
      avgTokens: Math.round(avgTokens)
    };
  }
}
