import type { EventBus, HarnessEvents } from '@harness/core';
import { sanitizePayload } from './sanitize.ts';

export type ConsoleSinkLevel = 'quiet' | 'normal' | 'verbose';

const CONSOLE_MAX_STRING_LENGTH = 2000;

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
      console.log(
        `[harness:${eventName}] ${JSON.stringify(sanitizePayload(payload, CONSOLE_MAX_STRING_LENGTH))}`,
      );
    });
    unsubs.push(unsub);
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
