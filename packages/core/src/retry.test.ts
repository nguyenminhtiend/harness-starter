import { describe, expect, mock, test } from 'bun:test';
import { ProviderError } from './errors.ts';
import { createEventBus } from './events/bus.ts';
import { withRetry } from './retry.ts';

const FAST = { baseDelayMs: 1, maxDelayMs: 10, jitter: 'none' as const };

describe('withRetry', () => {
  test('succeeds on first attempt — no retries', async () => {
    const fn = mock(() => Promise.resolve('ok'));
    const result = await withRetry(fn, { ...FAST });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on retriable error and succeeds on attempt N', async () => {
    let calls = 0;
    const fn = mock(async () => {
      calls++;
      if (calls < 3) {
        throw new ProviderError('server error', { kind: 'server', status: 500 });
      }
      return 'recovered';
    });
    const result = await withRetry(fn, { ...FAST, maxAttempts: 5 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('gives up after maxAttempts and throws last error', async () => {
    const err = new ProviderError('always fails', { kind: 'server', status: 500 });
    const fn = mock(() => Promise.reject(err));
    await expect(withRetry(fn, { ...FAST, maxAttempts: 3 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('non-retriable error throws immediately — no retry', async () => {
    const err = new ProviderError('bad auth', { kind: 'auth', status: 401 });
    const fn = mock(() => Promise.reject(err));
    await expect(withRetry(fn, { ...FAST, maxAttempts: 5 })).rejects.toThrow('bad auth');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('respects abort signal mid-retry (abort wins)', async () => {
    const ac = new AbortController();
    let calls = 0;
    const fn = mock(async () => {
      calls++;
      if (calls === 1) {
        throw new ProviderError('server error', { kind: 'server', status: 500 });
      }
      return 'should not reach';
    });
    // Use a longer delay so the abort has time to fire during the wait
    const promise = withRetry(
      fn,
      { baseDelayMs: 200, maxDelayMs: 1000, jitter: 'none', maxAttempts: 5 },
      { signal: ac.signal },
    );
    // Abort after a short time, while retry is waiting
    setTimeout(() => ac.abort('user cancelled'), 20);
    await expect(promise).rejects.toThrow();
    expect(fn.mock.calls.length).toBeLessThanOrEqual(2);
  });

  test('emits provider.retry events with correct attempt count', async () => {
    const bus = createEventBus();
    const events: Array<{ attempt: number; delayMs: number }> = [];
    bus.on('provider.retry', (e) => events.push({ attempt: e.attempt, delayMs: e.delayMs }));

    let calls = 0;
    const fn = mock(async () => {
      calls++;
      if (calls < 3) {
        throw new ProviderError('fail', { kind: 'server', status: 500 });
      }
      return 'ok';
    });
    await withRetry(fn, { ...FAST, maxAttempts: 5 }, { bus, runId: 'r1' });
    expect(events).toHaveLength(2);
    expect(events[0]?.attempt).toBe(1);
    expect(events[1]?.attempt).toBe(2);
  });

  test('respects Retry-After on rate limit errors', async () => {
    let calls = 0;
    const fn = mock(async () => {
      calls++;
      if (calls === 1) {
        throw new ProviderError('rate limited', {
          kind: 'rate_limit',
          status: 429,
          retryAfter: 10,
        });
      }
      return 'ok';
    });

    const bus = createEventBus();
    const delays: number[] = [];
    bus.on('provider.retry', (e) => delays.push(e.delayMs));

    await withRetry(fn, { ...FAST, maxAttempts: 3 }, { bus, runId: 'r1' });
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(10);
  });

  test('custom retryOn predicate', async () => {
    let calls = 0;
    const fn = mock(async () => {
      calls++;
      if (calls < 3) {
        throw new Error('custom retriable');
      }
      return 'ok';
    });
    const result = await withRetry(fn, {
      ...FAST,
      maxAttempts: 5,
      retryOn: (e) => e instanceof Error && e.message.includes('custom retriable'),
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('jitter full produces delay within expected range', async () => {
    const bus = createEventBus();
    const delays: number[] = [];
    bus.on('provider.retry', (e) => delays.push(e.delayMs));

    let calls = 0;
    const fn = mock(async () => {
      calls++;
      if (calls < 4) {
        throw new ProviderError('fail', { kind: 'server', status: 500 });
      }
      return 'ok';
    });

    await withRetry(
      fn,
      { baseDelayMs: 100, maxDelayMs: 10000, jitter: 'full', maxAttempts: 5 },
      { bus, runId: 'r1' },
    );
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(10000);
    }
  });
});
