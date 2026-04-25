import { describe, expect, it } from 'bun:test';
import type { SessionEvent } from '../domain/session-event.ts';
import { createInMemoryEventBus } from './event-bus.ts';

function makeEvent(runId: string, seq: number): SessionEvent {
  return {
    runId,
    seq,
    ts: '2026-04-24T00:00:00.000Z',
    type: 'text.delta',
    text: `chunk-${seq}`,
  } as SessionEvent;
}

describe('InMemoryEventBus', () => {
  it('delivers published events to subscriber', async () => {
    const bus = createInMemoryEventBus();
    const iter = bus.subscribe('r-1');

    bus.publish(makeEvent('r-1', 0));
    bus.publish(makeEvent('r-1', 1));
    bus.close('r-1');

    const events: SessionEvent[] = [];
    for await (const e of iter) {
      events.push(e);
    }
    expect(events).toHaveLength(2);
    expect(events[0]?.seq).toBe(0);
    expect(events[1]?.seq).toBe(1);
  });

  it('buffers events published before next() is called', async () => {
    const bus = createInMemoryEventBus();
    bus.publish(makeEvent('r-1', 0));
    bus.publish(makeEvent('r-1', 1));

    const iter = bus.subscribe('r-1');
    bus.publish(makeEvent('r-1', 2));
    bus.close('r-1');

    const events: SessionEvent[] = [];
    for await (const e of iter) {
      events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.seq).toBe(2);
  });

  it('supports multiple subscribers on same runId', async () => {
    const bus = createInMemoryEventBus();
    const iter1 = bus.subscribe('r-1');
    const iter2 = bus.subscribe('r-1');

    bus.publish(makeEvent('r-1', 0));
    bus.close('r-1');

    const events1: SessionEvent[] = [];
    for await (const e of iter1) {
      events1.push(e);
    }
    const events2: SessionEvent[] = [];
    for await (const e of iter2) {
      events2.push(e);
    }

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });

  it('isolates events between different runIds', async () => {
    const bus = createInMemoryEventBus();
    const iter1 = bus.subscribe('r-1');
    const iter2 = bus.subscribe('r-2');

    bus.publish(makeEvent('r-1', 0));
    bus.publish(makeEvent('r-2', 0));
    bus.close('r-1');
    bus.close('r-2');

    const events1: SessionEvent[] = [];
    for await (const e of iter1) {
      events1.push(e);
    }
    const events2: SessionEvent[] = [];
    for await (const e of iter2) {
      events2.push(e);
    }

    expect(events1).toHaveLength(1);
    expect(events1[0]?.runId).toBe('r-1');
    expect(events2).toHaveLength(1);
    expect(events2[0]?.runId).toBe('r-2');
  });

  it('close terminates all waiting subscribers', async () => {
    const bus = createInMemoryEventBus();
    const iter = bus.subscribe('r-1');

    const collected = (async () => {
      const events: SessionEvent[] = [];
      for await (const e of iter) {
        events.push(e);
      }
      return events;
    })();

    bus.publish(makeEvent('r-1', 0));
    bus.close('r-1');

    const events = await collected;
    expect(events).toHaveLength(1);
  });

  it('subscriber filters events by fromSeq', async () => {
    const bus = createInMemoryEventBus();
    const iter = bus.subscribe('r-1', 2);

    bus.publish(makeEvent('r-1', 0));
    bus.publish(makeEvent('r-1', 1));
    bus.publish(makeEvent('r-1', 2));
    bus.publish(makeEvent('r-1', 3));
    bus.close('r-1');

    const events: SessionEvent[] = [];
    for await (const e of iter) {
      events.push(e);
    }
    expect(events).toHaveLength(2);
    expect(events[0]?.seq).toBe(2);
    expect(events[1]?.seq).toBe(3);
  });

  it('return() on iterator terminates cleanly', async () => {
    const bus = createInMemoryEventBus();
    const iter = bus.subscribe('r-1')[Symbol.asyncIterator]();

    bus.publish(makeEvent('r-1', 0));
    const first = await iter.next();
    expect(first.done).toBe(false);

    const returned = await iter.return?.(undefined);
    expect(returned?.done).toBe(true);

    const after = await iter.next();
    expect(after.done).toBe(true);
  });
});
