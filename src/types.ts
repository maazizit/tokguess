export type TokenSource = 'copilot' | 'claude' | 'estimate';

export interface TokenEvent {
  id: string;
  timestamp: number;
  source: TokenSource;
  type: 'message' | 'session-summary' | 'file-estimate';
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  premiumRequests: number;
  sessionId?: string;
  estimated: boolean;
  /** Ephemeral live tick — not persisted (Copilot assistant.message) */
  liveOnly?: boolean;
  /** Replace existing event with same id (Claude last-wins dedup) */
  replace?: boolean;
}

export interface ModelUsage {
  input: number;
  output: number;
  cacheRead: number;
  cost: number;
  events: number;
}

export interface DayStats {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number;
  events: number;
  byModel: Record<string, ModelUsage>;
  bySource: Record<TokenSource, number>;
  hourly: number[];
}

export interface DashboardPayload {
  today: DayStats;
  period: DayStats;
  periodLabel: 'today' | 'week' | 'month';
  topModels: Array<{ model: string; tokens: number; cost: number; pct: number }>;
  recentSessions: Array<{
    sessionId: string;
    source: TokenSource;
    tokens: number;
    cost: number;
    lastSeen: number;
  }>;
  fileEstimate: number;
  contextBudget?: {
    fileTokens: number;
    selectionTokens: number;
    contextTokens: number;
    threshold: number;
    percent: number;
    level: string;
    hasSelection: boolean;
    fileName: string;
  };
  liveCopilotOutput: number;
  lastIngest: number | null;
  sources: {
    copilot: { enabled: boolean; path: string; active: boolean };
    claude: { enabled: boolean; path: string; active: boolean };
  };
}
