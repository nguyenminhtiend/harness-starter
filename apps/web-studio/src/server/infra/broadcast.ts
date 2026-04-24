import type { StreamChunk } from '../../shared/events.ts';

export interface RunBroadcast {
  push(chunk: StreamChunk): void;
  done(): void;
  subscribe(fromSeq?: number): AsyncIterable<{ seq: number; chunk: StreamChunk }>;
  readonly finished: boolean;
  readonly length: number;
}

export function createRunBroadcast(): RunBroadcast {
  const buffer: StreamChunk[] = [];
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

    push(chunk) {
      if (finished) {
        return;
      }
      buffer.push(chunk);
      notify();
    },

    done() {
      finished = true;
      notify();
    },

    subscribe(fromSeq = 0): AsyncIterable<{ seq: number; chunk: StreamChunk }> {
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
                const chunk = buffer[cursor];
                const seq = cursor;
                cursor++;
                if (chunk) {
                  return { done: false, value: { seq, chunk } };
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
