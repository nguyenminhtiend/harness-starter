import { NotFoundError } from '../domain/errors.ts';
import type { SessionEvent } from '../domain/session-event.ts';
import type { EventBus } from '../storage/memory/event-bus.ts';
import type { EventLog } from '../storage/memory/event-log.ts';
import type { RunStore } from '../storage/memory/run-store.ts';

export interface StreamRunEventsDeps {
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
  readonly eventBus: EventBus;
}

const TERMINAL_TYPES = new Set(['run.completed', 'run.failed', 'run.cancelled']);

export async function* streamRunEvents(
  deps: StreamRunEventsDeps,
  runId: string,
  fromSeq?: number,
): AsyncIterable<SessionEvent> {
  const run = await deps.runStore.get(runId);
  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  const subscription = deps.eventBus.subscribe(runId, fromSeq);
  const catchup = await deps.eventLog.read(runId, fromSeq);
  const seen = new Set<number>();

  for (const event of catchup) {
    seen.add(event.seq);
    yield event;
    if (TERMINAL_TYPES.has(event.type)) {
      return;
    }
  }

  for await (const event of subscription) {
    if (seen.has(event.seq)) {
      continue;
    }
    yield event;
    if (TERMINAL_TYPES.has(event.type)) {
      return;
    }
  }
}
