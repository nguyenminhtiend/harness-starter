import { describe, expect, test } from 'bun:test';
import { exactMatch } from './exact-match.ts';

describe('exactMatch', () => {
  test('returns 1 on exact match', async () => {
    const result = await exactMatch({ input: 'hello', output: 'world', expected: 'world' });
    expect(result.score).toBe(1);
    expect(result.name).toBe('exactMatch');
  });

  test('returns 0 on mismatch', async () => {
    const result = await exactMatch({ input: 'hello', output: 'world', expected: 'earth' });
    expect(result.score).toBe(0);
  });

  test('is case-sensitive', async () => {
    const result = await exactMatch({ input: 'x', output: 'Hello', expected: 'hello' });
    expect(result.score).toBe(0);
  });

  test('handles empty strings', async () => {
    const result = await exactMatch({ input: '', output: '', expected: '' });
    expect(result.score).toBe(1);
  });
});
