import { describe, expect, test } from 'bun:test';
import { includes } from './includes.ts';

describe('includes', () => {
  const scorer = includes();

  test('returns 1 when output contains expected', async () => {
    const result = await scorer({ input: 'x', output: 'hello world', expected: 'world' });
    expect(result.score).toBe(1);
  });

  test('returns 0 when output does not contain expected', async () => {
    const result = await scorer({ input: 'x', output: 'hello world', expected: 'mars' });
    expect(result.score).toBe(0);
  });

  test('is case-sensitive by default', async () => {
    const result = await scorer({ input: 'x', output: 'Hello', expected: 'hello' });
    expect(result.score).toBe(0);
  });

  test('returns 0 when expected is undefined', async () => {
    const result = await scorer({ input: 'x', output: 'hello' });
    expect(result.score).toBe(0);
  });

  describe('with ignoreCase', () => {
    const caseInsensitive = includes({ ignoreCase: true });

    test('matches case-insensitively', async () => {
      const result = await caseInsensitive({
        input: 'x',
        output: 'Hello World',
        expected: 'hello',
      });
      expect(result.score).toBe(1);
    });
  });
});
