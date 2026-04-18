import { appendFileSync } from 'node:fs';
import type { EventBus, HarnessEvents } from '@harness/core';

const REDACTED_KEYS = new Set([
  'apiKey',
  'api_key',
  'token',
  'secret',
  'password',
  'authorization',
  'credential',
  'credentials',
  'privateKey',
  'private_key',
]);

function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 10_000 ? `${value.slice(0, 10_000)}...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizePayload(v, depth + 1));
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
        out[k] = sanitizePayload(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/**
 * Every key in `HarnessEvents`. The `satisfies` ensures a compile error
 * if a key is added to `HarnessEvents` but not listed here.
 */
const ALL_EVENT_KEYS = [
  'run.start',
  'run.finish',
  'run.error',
  'turn.start',
  'turn.finish',
  'provider.call',
  'provider.usage',
  'provider.retry',
  'tool.start',
  'tool.approval',
  'tool.finish',
  'tool.error',
  'compaction',
  'structured.repair',
  'guardrail',
  'handoff',
  'checkpoint',
  'budget.exceeded',
] as const satisfies readonly (keyof HarnessEvents)[];

type _AssertExhaustive =
  Exclude<keyof HarnessEvents, (typeof ALL_EVENT_KEYS)[number]> extends never
    ? true
    : 'ALL_EVENT_KEYS is missing keys from HarnessEvents';

export function jsonlSink(bus: EventBus, opts: { path: string }): () => void {
  const { path } = opts;
  const unsubs: (() => void)[] = [];

  for (const eventName of ALL_EVENT_KEYS) {
    const unsub = bus.on(eventName, (payload: HarnessEvents[typeof eventName]) => {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        event: eventName,
        payload: sanitizePayload(payload),
      });
      appendFileSync(path, `${line}\n`, 'utf8');
    });
    unsubs.push(unsub);
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
