import type { UIEvent } from '../../shared/events.ts';

export interface RunBroadcast {
  push(event: UIEvent): void;
  done(): void;
  subscribe(fromSeq?: number): AsyncIterable<{ seq: number; event: UIEvent }>;
  readonly finished: boolean;
  readonly length: number;
}

export function createRunBroadcast(): RunBroadcast {
  const buffer: UIEvent[] = [];
  let finished = false;
  const waiters: Array<{ resolve: () => void }> = [];

  function notify() {
    for (const w of waiters.splice(0)) {
      w.resolve();
    }
  }

  return {
    get finished() {
      return finished;
    },

    get length() {
      return buffer.length;
    },

    push(event) {
      if (finished) {
        return;
      }
      buffer.push(event);
      notify();
    },

    done() {
      finished = true;
      notify();
    },

    subscribe(fromSeq = 0): AsyncIterable<{ seq: number; event: UIEvent }> {
      let cursor = Math.max(0, fromSeq);
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (cursor >= buffer.length && !finished) {
                await new Promise<void>((resolve) => {
                  waiters.push({ resolve });
                });
              }
              if (cursor < buffer.length) {
                const event = buffer[cursor];
                const seq = cursor;
                cursor++;
                if (event) {
                  return { done: false, value: { seq, event } };
                }
              }
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
  };
}
