import { appendFile } from 'node:fs/promises';
import type { EventBus, HarnessEvents } from '@harness/core';
import { sanitizePayload } from './sanitize.ts';

const JSONL_MAX_STRING_LENGTH = 10_000;

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
  let writeQueue = Promise.resolve();

  for (const eventName of ALL_EVENT_KEYS) {
    const unsub = bus.on(eventName, (payload: HarnessEvents[typeof eventName]) => {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        event: eventName,
        payload: sanitizePayload(payload, JSONL_MAX_STRING_LENGTH),
      });
      writeQueue = writeQueue.then(() => appendFile(path, `${line}\n`, 'utf8')).catch(() => {});
    });
    unsubs.push(unsub);
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
