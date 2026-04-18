import type { EventBus, HarnessEvents } from '@harness/core';

export type ConsoleSinkLevel = 'quiet' | 'normal' | 'verbose';

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
    return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
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

export interface ConsoleSinkOpts {
  level?: ConsoleSinkLevel;
}

const QUIET_EVENTS: ReadonlySet<keyof HarnessEvents> = new Set([
  'run.start',
  'run.finish',
  'run.error',
  'budget.exceeded',
]);

const NORMAL_EVENTS: ReadonlySet<keyof HarnessEvents> = new Set([
  ...QUIET_EVENTS,
  'turn.start',
  'turn.finish',
  'tool.start',
  'tool.finish',
  'tool.error',
  'tool.approval',
  'guardrail',
  'handoff',
  'compaction',
  'checkpoint',
]);

const VERBOSE_EVENTS: ReadonlySet<keyof HarnessEvents> = new Set([
  ...NORMAL_EVENTS,
  'provider.call',
  'provider.usage',
  'provider.retry',
  'structured.repair',
]);

function eventsForLevel(level: ConsoleSinkLevel): ReadonlySet<keyof HarnessEvents> {
  switch (level) {
    case 'quiet':
      return QUIET_EVENTS;
    case 'normal':
      return NORMAL_EVENTS;
    case 'verbose':
      return VERBOSE_EVENTS;
  }
}

export function consoleSink(bus: EventBus, opts?: ConsoleSinkOpts): () => void {
  const level = opts?.level ?? 'normal';
  const allowed = eventsForLevel(level);
  const unsubs: (() => void)[] = [];

  for (const eventName of allowed) {
    const unsub = bus.on(eventName, (payload: HarnessEvents[typeof eventName]) => {
      console.log(`[harness:${eventName}] ${JSON.stringify(sanitizePayload(payload))}`);
    });
    unsubs.push(unsub);
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
