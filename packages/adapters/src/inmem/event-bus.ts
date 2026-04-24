import type { EventBus, SessionEvent } from '@harness/core';

interface Subscriber {
  push(event: SessionEvent): void;
  terminate(): void;
}

export function createInMemoryEventBus(): EventBus {
  const subscribers = new Map<string, Subscriber[]>();
  const closed = new Set<string>();

  return {
    publish(event) {
      const subs = subscribers.get(event.runId);
      if (subs) {
        for (const sub of subs) {
          sub.push(event);
        }
      }
    },

    subscribe(runId, fromSeq?) {
      const buffer: SessionEvent[] = [];
      let resolve: ((value: IteratorResult<SessionEvent>) => void) | null = null;
      let done = false;

      const sub: Subscriber = {
        push(event) {
          if (done) {
            return;
          }
          if (fromSeq !== undefined && event.seq < fromSeq) {
            return;
          }
          if (resolve) {
            const r = resolve;
            resolve = null;
            r({ value: event, done: false });
          } else {
            buffer.push(event);
          }
        },
        terminate() {
          if (done) {
            return;
          }
          if (buffer.length === 0 && resolve) {
            done = true;
            const r = resolve;
            resolve = null;
            r({ value: undefined as unknown as SessionEvent, done: true });
          }
        },
      };

      const subs = subscribers.get(runId) ?? [];
      subs.push(sub);
      subscribers.set(runId, subs);

      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<SessionEvent>> {
              if (done) {
                return Promise.resolve({ value: undefined as unknown as SessionEvent, done: true });
              }
              const buffered = buffer.shift();
              if (buffered) {
                return Promise.resolve({ value: buffered, done: false });
              }
              if (closed.has(runId)) {
                done = true;
                return Promise.resolve({ value: undefined as unknown as SessionEvent, done: true });
              }
              return new Promise<IteratorResult<SessionEvent>>((r) => {
                resolve = r;
              });
            },
            return() {
              done = true;
              if (resolve) {
                const r = resolve;
                resolve = null;
                r({ value: undefined as unknown as SessionEvent, done: true });
              }
              return Promise.resolve({ value: undefined as unknown as SessionEvent, done: true });
            },
          };
        },
      };
    },

    close(runId) {
      closed.add(runId);
      const subs = subscribers.get(runId);
      if (subs) {
        for (const sub of subs) {
          sub.terminate();
        }
        subscribers.delete(runId);
      }
    },
  };
}
