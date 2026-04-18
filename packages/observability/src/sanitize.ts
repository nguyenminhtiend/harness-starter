const REDACTED_KEYS = new Set([
  'apikey',
  'api_key',
  'token',
  'secret',
  'password',
  'authorization',
  'credential',
  'credentials',
  'privatekey',
  'private_key',
]);

export function sanitizePayload(value: unknown, maxStringLength: number, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > maxStringLength
      ? `${value.slice(0, maxStringLength)}...[truncated]`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizePayload(v, maxStringLength, depth + 1));
  }
  if (typeof value === 'object') {
    const obj =
      typeof (value as { toJSON?: unknown }).toJSON === 'function'
        ? (value as { toJSON(): unknown }).toJSON()
        : value;
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizePayload(v, maxStringLength, depth + 1);
      }
    }
    return out;
  }
  return value;
}
