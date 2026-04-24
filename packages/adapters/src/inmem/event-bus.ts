import type { EventBus, SessionEvent } from '@harness/core';

interface Subscriber {
  push(event: SessionEvent): void;
  terminate(): void;
}

const ITER_DONE: IteratorResult<SessionEvent> = {
  value: undefined as unknown as SessionEvent,
  done: true,
};

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

      function flush(r: (value: IteratorResult<SessionEvent>) => void): void {
        resolve = null;
        done = true;
        r(ITER_DONE);
      }

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
            flush(resolve);
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
                return Promise.resolve(ITER_DONE);
              }
              const buffered = buffer.shift();
              if (buffered) {
                return Promise.resolve({ value: buffered, done: false });
              }
              if (closed.has(runId)) {
                done = true;
                return Promise.resolve(ITER_DONE);
              }
              return new Promise<IteratorResult<SessionEvent>>((r) => {
                resolve = r;
              });
            },
            return() {
              if (resolve) {
                flush(resolve);
              } else {
                done = true;
              }
              return Promise.resolve(ITER_DONE);
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
