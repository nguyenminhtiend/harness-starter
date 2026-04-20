import type { UIEvent } from '../../shared/events.ts';

export interface RunBroadcast {
  push(event: UIEvent): void;
  done(): void;
  subscribe(): AsyncIterable<UIEvent>;
  readonly finished: boolean;
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

    subscribe(): AsyncIterable<UIEvent> {
      let cursor = 0;
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
                const value = buffer[cursor];
                cursor++;
                if (value) {
                  return { done: false, value };
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
