const SENSITIVE_KEY_PATTERNS = [
  /^prompt/i,
  /^content/i,
  /^message/i,
  /^text/i,
  /^body/i,
  /^input\.text/i,
  /^output\.text/i,
  /password/i,
  /secret/i,
  /token$/i
];

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

export function scrubAttributes(attrs: OtelAttribute[]): OtelAttribute[] {
  return attrs.filter((a) => !SENSITIVE_KEY_PATTERNS.some((p) => p.test(a.key)));
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
