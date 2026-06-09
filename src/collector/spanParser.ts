import { OtelAttribute, attrNumber, attrString, scrubAttributes } from './scrubber';

export interface CopilotSpanRecord {
  id: string;
  traceId: string;
  spanId: string;
  name: string;
  timestamp: number;
  durationMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  model?: string;
  agentMode?: string;
  sessionId?: string;
}

interface OtlpSpan {
  traceId?: string;
  spanId?: string;
  name?: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: OtelAttribute[];
}

interface OtlpPayload {
  resourceSpans?: Array<{
    scopeSpans?: Array<{ spans?: OtlpSpan[] }>;
  }>;
}

function nanoToMs(nano?: string): number {
  if (!nano) {
    return Date.now();
  }
  return Math.floor(Number(nano) / 1_000_000);
}

function isCopilotSpan(name: string, attrs: OtelAttribute[]): boolean {
  const n = name.toLowerCase();
  if (n.includes('copilot') || n.includes('invoke_agent')) {
    return true;
  }
  return attrs.some(
    (a) =>
      a.key.includes('copilot') ||
      a.key.includes('copilot_chat') ||
      a.key === 'gen_ai.system'
  );
}

function parseSpan(span: OtlpSpan): CopilotSpanRecord | null {
  const name = span.name ?? '';
  const rawAttrs = span.attributes ?? [];
  if (!isCopilotSpan(name, rawAttrs)) {
    return null;
  }

  const attrs = scrubAttributes(rawAttrs);
  const totalTokens = attrNumber(attrs, 'Tokens', 'tokens', 'gen_ai.usage.total_tokens');
  const inputTokens = attrNumber(
    attrs,
    'input_tokens',
    'gen_ai.usage.input_tokens',
    'prompt_tokens'
  );
  const outputTokens = attrNumber(
    attrs,
    'output_tokens',
    'gen_ai.usage.output_tokens',
    'completion_tokens'
  );

  let total = totalTokens ?? 0;
  let input = inputTokens ?? 0;
  let output = outputTokens ?? 0;

  if (total > 0 && input === 0 && output === 0) {
    input = Math.floor(total * 0.85);
    output = total - input;
  } else if (input > 0 || output > 0) {
    total = input + output;
  }

  if (total <= 0) {
    return null;
  }

  const start = nanoToMs(span.startTimeUnixNano);
  const end = nanoToMs(span.endTimeUnixNano);
  const traceId = span.traceId ?? 'unknown';
  const spanId = span.spanId ?? String(start);

  return {
    id: `otel-${traceId}-${spanId}`,
    traceId,
    spanId,
    name,
    timestamp: start,
    durationMs: Math.max(end - start, 0),
    totalTokens: total,
    inputTokens: input,
    outputTokens: output,
    model: attrString(attrs, 'gen_ai.request.model', 'model', 'model.name'),
    agentMode: attrString(attrs, 'copilot_chat.mode_name', 'agent', 'mode_name'),
    sessionId: attrString(attrs, 'copilot_chat.session_id', 'session_id', 'session.id')
  };
}

export function parseOtlpBody(body: unknown): CopilotSpanRecord[] {
  const payload = body as OtlpPayload;
  const results: CopilotSpanRecord[] = [];
  const seen = new Set<string>();

  for (const rs of payload.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const parsed = parseSpan(span);
        if (parsed && !seen.has(parsed.id)) {
          seen.add(parsed.id);
          results.push(parsed);
        }
      }
    }
  }

  return results;
}
