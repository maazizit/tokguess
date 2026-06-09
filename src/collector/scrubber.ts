/**
 * Attribute scrubbing — ALLOWLIST strategy.
 *
 * Only attributes whose keys are explicitly known-safe (token counts, model
 * names, session/mode identifiers) are kept. Everything else — including any
 * unknown attribute that could carry prompt text, code or secrets — is
 * dropped before a span is stored or processed.
 */
const SAFE_KEY_PATTERNS = [
  // Token counters: tokens, input_tokens, output_tokens, prompt_tokens,
  // completion_tokens, total_tokens, gen_ai.usage.*
  /(^|[._-])(total[._-]?|input[._-]?|output[._-]?|prompt[._-]?|completion[._-]?)?tokens$/i,
  /^gen_ai\.usage\./i,
  // Model identity
  /^gen_ai\.request\.model$/i,
  /^gen_ai\.system$/i,
  /^model(\.name)?$/i,
  // Session / agent mode identifiers
  /(^|[._-])session[._-]?id$/i,
  /(^|[._-])mode[._-]?name$/i,
  /^agent$/i,
  /^copilot_chat\.(session_id|mode_name)$/i
];

/** Hard cap on stored string values — counts/ids/models are always short. */
const MAX_STRING_LENGTH = 128;

export interface OtelAttribute {
  key: string;
  value: OtelValue;
}

export interface OtelValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
}

export function isSafeKey(key: string): boolean {
  return SAFE_KEY_PATTERNS.some((p) => p.test(key));
}

export function scrubAttributes(attrs: OtelAttribute[]): OtelAttribute[] {
  const safe: OtelAttribute[] = [];
  for (const a of attrs) {
    if (!isSafeKey(a.key)) {
      continue;
    }
    if (typeof a.value.stringValue === 'string' && a.value.stringValue.length > MAX_STRING_LENGTH) {
      safe.push({
        key: a.key,
        value: { ...a.value, stringValue: a.value.stringValue.slice(0, MAX_STRING_LENGTH) }
      });
    } else {
      safe.push(a);
    }
  }
  return safe;
}

export function attrString(attrs: OtelAttribute[], ...keys: string[]): string | undefined {
  for (const key of keys) {
    const found = attrs.find((a) => a.key === key || a.key.endsWith(key));
    if (found) {
      const v = found.value;
      if (v.stringValue) {
        return v.stringValue;
      }
      if (v.intValue !== undefined) {
        return String(v.intValue);
      }
      if (v.doubleValue !== undefined) {
        return String(v.doubleValue);
      }
    }
  }
  return undefined;
}

export function attrNumber(attrs: OtelAttribute[], ...keys: string[]): number | undefined {
  for (const key of keys) {
    const found = attrs.find(
      (a) =>
        a.key === key ||
        a.key.toLowerCase() === key.toLowerCase() ||
        a.key.endsWith(key)
    );
    if (found) {
      const v = found.value;
      if (v.intValue !== undefined) {
        return Number(v.intValue);
      }
      if (v.doubleValue !== undefined) {
        return Math.round(v.doubleValue);
      }
      if (v.stringValue) {
        const n = Number(v.stringValue);
        if (!Number.isNaN(n)) {
          return n;
        }
      }
    }
  }
  return undefined;
}
