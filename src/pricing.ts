export interface ModelRate {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
}

const RATES: Record<string, ModelRate> = {
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8 },
  'gpt-4': { inputPer1M: 30, outputPer1M: 60 },
  'claude-sonnet-4': { inputPer1M: 3, outputPer1M: 15 },
  'claude-sonnet-4-20250514': { inputPer1M: 3, outputPer1M: 15 },
  'claude-opus-4': { inputPer1M: 15, outputPer1M: 75 },
  'claude-3-5-sonnet': { inputPer1M: 3, outputPer1M: 15 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10 },
  'gemini-2.5-flash': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gemini': { inputPer1M: 1.25, outputPer1M: 10 },
  'copilot': { inputPer1M: 2.5, outputPer1M: 10 }
};

const FALLBACK: ModelRate = { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3 };

export function estimateCost(
  model: string | undefined,
  input: number,
  output: number,
  cacheRead = 0
): number {
  const rate = resolveRate(model);
  const cacheRate = rate.cacheReadPer1M ?? rate.inputPer1M * 0.1;
  return (
    (input / 1_000_000) * rate.inputPer1M +
    (output / 1_000_000) * rate.outputPer1M +
    (cacheRead / 1_000_000) * cacheRate
  );
}

function resolveRate(model?: string): ModelRate {
  if (!model) {
    return FALLBACK;
  }
  const key = Object.keys(RATES).find((k) => model.toLowerCase().includes(k));
  return key ? RATES[key] : FALLBACK;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  if (usd < 1) {
    return `$${usd.toFixed(3)}`;
  }
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}
