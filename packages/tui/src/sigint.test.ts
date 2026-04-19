import { afterEach, describe, expect, it } from 'bun:test';
import { setupSigint } from './sigint.ts';

describe('setupSigint', () => {
  const originalListeners: ((...args: unknown[]) => void)[] = [];

  afterEach(() => {
    for (const listener of originalListeners) {
      process.removeListener('SIGINT', listener);
      process.removeListener('SIGTERM', listener);
    }
    originalListeners.length = 0;
  });

  function captureListeners() {
    const before = process.listenerCount('SIGINT');
    return () => {
      const added = process.listenerCount('SIGINT') - before;
      const listeners = process.listeners('SIGINT').slice(-added);
      originalListeners.push(...(listeners as ((...args: unknown[]) => void)[]));
    };
  }

  it('calls onAbort when streaming and SIGINT received', () => {
    const capture = captureListeners();
    let aborted = false;
    let exited = false;

    setupSigint({
      isStreaming: () => true,
      onAbort: () => {
        aborted = true;
      },
      onExit: () => {
        exited = true;
      },
    });
    capture();

    process.emit('SIGINT');

    expect(aborted).toBe(true);
    expect(exited).toBe(false);
  });

  it('calls onExit when not streaming and SIGINT received', () => {
    const capture = captureListeners();
    let aborted = false;
    let exited = false;

    setupSigint({
      isStreaming: () => false,
      onAbort: () => {
        aborted = true;
      },
      onExit: () => {
        exited = true;
      },
    });
    capture();

    process.emit('SIGINT');

    expect(aborted).toBe(false);
    expect(exited).toBe(true);
  });

  it('calls onExit on SIGTERM', () => {
    const capture = captureListeners();
    let aborted = false;
    let exited = false;

    setupSigint({
      isStreaming: () => true,
      onAbort: () => {
        aborted = true;
      },
      onExit: () => {
        exited = true;
      },
    });
    capture();

    process.emit('SIGTERM');

    expect(exited).toBe(true);
    expect(aborted).toBe(false);
  });
});
