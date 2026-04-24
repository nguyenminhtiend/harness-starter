import { describe, expect, it } from 'bun:test';
import type { SessionEvent } from '../domain/session-event.ts';
import type { EventLog } from './inmem-event-log.ts';
import { createInMemoryEventLog } from './inmem-event-log.ts';

function makeEvent(runId: string, seq: number, type = 'text.delta' as const): SessionEvent {
  return {
    runId,
    seq,
    ts: '2026-04-24T00:00:00.000Z',
    type,
    text: `chunk-${seq}`,
  } as SessionEvent;
}

function makeLog(): EventLog {
  return createInMemoryEventLog();
}

describe('InMemoryEventLog', () => {
  it('appends and reads events', async () => {
    const log = makeLog();
    await log.append(makeEvent('r-1', 0));
    await log.append(makeEvent('r-1', 1));

    const events = await log.read('r-1');
    expect(events).toHaveLength(2);
    expect(events[0]?.seq).toBe(0);
    expect(events[1]?.seq).toBe(1);
  });

  it('reads events with fromSeq filter', async () => {
    const log = makeLog();
    await log.append(makeEvent('r-1', 0));
    await log.append(makeEvent('r-1', 1));
    await log.append(makeEvent('r-1', 2));

    const events = await log.read('r-1', 1);
    expect(events).toHaveLength(2);
    expect(events[0]?.seq).toBe(1);
  });

  it('reads events with toSeq filter', async () => {
    const log = makeLog();
    await log.append(makeEvent('r-1', 0));
    await log.append(makeEvent('r-1', 1));
    await log.append(makeEvent('r-1', 2));

    const events = await log.read('r-1', undefined, 1);
    expect(events).toHaveLength(2);
    expect(events[1]?.seq).toBe(1);
  });

  it('reads events with both fromSeq and toSeq', async () => {
    const log = makeLog();
    for (let i = 0; i < 5; i++) {
      await log.append(makeEvent('r-1', i));
    }

    const events = await log.read('r-1', 1, 3);
    expect(events).toHaveLength(3);
    expect(events[0]?.seq).toBe(1);
    expect(events[2]?.seq).toBe(3);
  });

  it('returns empty array for non-existent run', async () => {
    const log = makeLog();
    expect(await log.read('nope')).toEqual([]);
  });

  it('returns lastSeq for a run', async () => {
    const log = makeLog();
    await log.append(makeEvent('r-1', 0));
    await log.append(makeEvent('r-1', 1));
    await log.append(makeEvent('r-1', 2));

    expect(await log.lastSeq('r-1')).toBe(2);
  });

  it('returns undefined lastSeq for non-existent run', async () => {
    const log = makeLog();
    expect(await log.lastSeq('nope')).toBeUndefined();
  });

  it('isolates events between runs', async () => {
    const log = makeLog();
    await log.append(makeEvent('r-1', 0));
    await log.append(makeEvent('r-2', 0));

    expect(await log.read('r-1')).toHaveLength(1);
    expect(await log.read('r-2')).toHaveLength(1);
  });

  it('preserves event data through round-trip', async () => {
    const log = makeLog();
    const event: SessionEvent = {
      runId: 'r-1',
      seq: 0,
      ts: '2026-04-24T00:00:00.000Z',
      type: 'run.started',
      capabilityId: 'simple-chat',
      input: { message: 'hello' },
    } as SessionEvent;

    await log.append(event);
    const [stored] = await log.read('r-1');
    expect(stored).toEqual(event);
  });
});
