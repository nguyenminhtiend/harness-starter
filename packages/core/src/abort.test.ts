import { describe, expect, test } from 'bun:test';
import { assertNotAborted, linkedSignal, timeoutSignal } from './abort.ts';

describe('linkedSignal', () => {
  test('aborts when parent aborts', () => {
    const ac = new AbortController();
    const linked = linkedSignal(ac.signal);
    expect(linked.aborted).toBe(false);
    ac.abort('parent cancelled');
    expect(linked.aborted).toBe(true);
    expect(linked.reason).toBe('parent cancelled');
  });

  test('aborts when any of multiple parents abort', () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    const linked = linkedSignal(ac1.signal, ac2.signal);
    expect(linked.aborted).toBe(false);
    ac2.abort('second cancelled');
    expect(linked.aborted).toBe(true);
    expect(linked.reason).toBe('second cancelled');
  });

  test('already-aborted parent causes immediate abort', () => {
    const ac = new AbortController();
    ac.abort('already done');
    const linked = linkedSignal(ac.signal);
    expect(linked.aborted).toBe(true);
  });

  test('skips undefined signals', () => {
    const ac = new AbortController();
    const linked = linkedSignal(undefined, ac.signal, undefined);
    expect(linked.aborted).toBe(false);
    ac.abort();
    expect(linked.aborted).toBe(true);
  });

  test('returns non-aborted signal when no parents given', () => {
    const linked = linkedSignal();
    expect(linked.aborted).toBe(false);
  });
});

describe('timeoutSignal', () => {
  test('aborts after specified delay', async () => {
    const signal = timeoutSignal(50);
    expect(signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(signal.aborted).toBe(true);
  });
});

describe('assertNotAborted', () => {
  test('does nothing for undefined signal', () => {
    expect(() => assertNotAborted(undefined)).not.toThrow();
  });

  test('does nothing for non-aborted signal', () => {
    const ac = new AbortController();
    expect(() => assertNotAborted(ac.signal)).not.toThrow();
  });

  test('throws for aborted signal', () => {
    const ac = new AbortController();
    ac.abort('cancelled');
    expect(() => assertNotAborted(ac.signal)).toThrow();
  });

  test('thrown error has abort reason', () => {
    const ac = new AbortController();
    ac.abort('test reason');
    try {
      assertNotAborted(ac.signal);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
    }
  });
});
