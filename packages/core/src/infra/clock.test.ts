import { describe, expect, it } from 'bun:test';
import { createSystemClock } from './clock.ts';

describe('SystemClock', () => {
  it('returns an ISO8601 datetime string', () => {
    const clock = createSystemClock();
    const ts = clock.now();
    expect(() => new Date(ts)).not.toThrow();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('returns a value close to Date.now()', () => {
    const clock = createSystemClock();
    const before = Date.now();
    const ts = new Date(clock.now()).getTime();
    const after = Date.now();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
