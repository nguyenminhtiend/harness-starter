import { describe, expect, it } from 'bun:test';
import { formatUsage } from './usage.ts';

describe('formatUsage', () => {
  it('formats tokens and duration without cost', () => {
    const result = formatUsage({ totalTokens: 54, durationMs: 300 });
    expect(result).toBe('(54 tokens · 0.3s)');
  });

  it('formats tokens, duration, and cost', () => {
    const result = formatUsage({ totalTokens: 42318, durationMs: 28400, cost: 0.14 });
    expect(result).toBe('(42,318 tokens · 28.4s · $0.14)');
  });

  it('formats zero tokens', () => {
    const result = formatUsage({ totalTokens: 0, durationMs: 0 });
    expect(result).toBe('(0 tokens · 0.0s)');
  });

  it('formats large token counts with commas', () => {
    const result = formatUsage({ totalTokens: 1234567, durationMs: 5000 });
    expect(result).toBe('(1,234,567 tokens · 5.0s)');
  });

  it('formats cost with two decimal places', () => {
    const result = formatUsage({ totalTokens: 100, durationMs: 1000, cost: 1.5 });
    expect(result).toBe('(100 tokens · 1.0s · $1.50)');
  });

  it('omits cost when undefined', () => {
    const result = formatUsage({ totalTokens: 100, durationMs: 1000, cost: undefined });
    expect(result).not.toContain('$');
  });
});
