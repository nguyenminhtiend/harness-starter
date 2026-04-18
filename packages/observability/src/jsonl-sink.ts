import { appendFileSync } from 'node:fs';
import type { EventBus, HarnessEvents } from '@harness/core';

/** Every key in `HarnessEvents` — keep in sync when the catalog changes. */
const ALL_EVENT_KEYS: readonly (keyof HarnessEvents)[] = [
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
];

export function jsonlSink(bus: EventBus, opts: { path: string }): () => void {
  const { path } = opts;
  const unsubs: (() => void)[] = [];

  for (const eventName of ALL_EVENT_KEYS) {
    const unsub = bus.on(eventName, (payload: HarnessEvents[typeof eventName]) => {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        event: eventName,
        payload,
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
