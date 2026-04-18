import { describe, expect, test } from 'bun:test';
import { finishedWithin } from './finished-within.ts';

describe('finishedWithin', () => {
  test('returns 1 when within limit', async () => {
    const scorer = finishedWithin(1000);
    const result = await scorer({ input: 'x', output: { durationMs: 500 } });
    expect(result.score).toBe(1);
  });

  test('returns 1 when exactly at limit', async () => {
    const scorer = finishedWithin(1000);
    const result = await scorer({ input: 'x', output: { durationMs: 1000 } });
    expect(result.score).toBe(1);
  });

  test('returns 0 when over limit', async () => {
    const scorer = finishedWithin(1000);
    const result = await scorer({ input: 'x', output: { durationMs: 1500 } });
    expect(result.score).toBe(0);
  });

  test('includes duration metadata', async () => {
    const scorer = finishedWithin(2000);
    const result = await scorer({ input: 'x', output: { durationMs: 750 } });
    expect(result.score).toBe(1);
    expect(result.metadata).toEqual({ actualMs: 750, limitMs: 2000 });
  });
});
