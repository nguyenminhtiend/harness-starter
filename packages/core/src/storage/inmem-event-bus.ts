import type { SessionEvent } from '../domain/session-event.ts';

export interface EventBus {
  publish(event: SessionEvent): void;
  subscribe(runId: string, fromSeq?: number): AsyncIterable<SessionEvent>;
  close(runId: string): void;
}

const MAX_BUFFER_SIZE = 10_000;

interface Subscriber {
  push(event: SessionEvent): void;
  terminate(): void;
  readonly dead: boolean;
}

const ITER_DONE: IteratorResult<SessionEvent> = {
  value: undefined as unknown as SessionEvent,
  done: true,
};

export function createInMemoryEventBus(): EventBus {
  const subscribers = new Map<string, Subscriber[]>();
  const closed = new Set<string>();

  function removeSub(runId: string, sub: Subscriber): void {
    const subs = subscribers.get(runId);
    if (!subs) {
      return;
    }
    const idx = subs.indexOf(sub);
    if (idx >= 0) {
      subs.splice(idx, 1);
    }
    if (subs.length === 0) {
      subscribers.delete(runId);
    }
  }

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

      let closing = closed.has(runId);

      const sub: Subscriber = {
        get dead() {
          return done;
        },
        push(event) {
          if (done || closing) {
            return;
          }
          if (fromSeq !== undefined && event.seq < fromSeq) {
            return;
          }
          if (resolve) {
            const r = resolve;
            resolve = null;
            r({ value: event, done: false });
          } else if (buffer.length < MAX_BUFFER_SIZE) {
            buffer.push(event);
          }
        },
        terminate() {
          if (done) {
            return;
          }
          closing = true;
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
                if (closing && buffer.length === 0) {
                  done = true;
                }
                return Promise.resolve({ value: buffered, done: false });
              }
              if (closing) {
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
              removeSub(runId, sub);
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
