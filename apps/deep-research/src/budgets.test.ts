import { describe, expect, it } from 'bun:test';
import { splitBudget } from './budgets.ts';

describe('splitBudget', () => {
  it('splits budget according to D13 ratios (10/60/20/10)', () => {
    const split = splitBudget({ usd: 1.0, tokens: 100_000 });
    expect(split.planner).toEqual({ usd: 0.1, tokens: 10_000 });
    expect(split.researcher).toEqual({ usd: 0.6, tokens: 60_000 });
    expect(split.writer).toEqual({ usd: 0.2, tokens: 20_000 });
    expect(split.factChecker).toEqual({ usd: 0.1, tokens: 10_000 });
  });

  it('uses default budget from config when no overrides given', () => {
    const split = splitBudget({ usd: 0.5, tokens: 200_000 });
    expect(split.planner.usd).toBe(0.05);
    expect(split.planner.tokens).toBe(20_000);
    expect(split.researcher.usd).toBe(0.3);
    expect(split.researcher.tokens).toBe(120_000);
    expect(split.writer.usd).toBe(0.1);
    expect(split.writer.tokens).toBe(40_000);
    expect(split.factChecker.usd).toBe(0.05);
    expect(split.factChecker.tokens).toBe(20_000);
  });

  it('handles undefined usd gracefully', () => {
    const split = splitBudget({ tokens: 100_000 });
    expect(split.planner.usd).toBeUndefined();
    expect(split.planner.tokens).toBe(10_000);
    expect(split.researcher.usd).toBeUndefined();
  });

  it('handles undefined tokens gracefully', () => {
    const split = splitBudget({ usd: 1.0 });
    expect(split.planner.tokens).toBeUndefined();
    expect(split.planner.usd).toBe(0.1);
    expect(split.researcher.tokens).toBeUndefined();
  });
});
