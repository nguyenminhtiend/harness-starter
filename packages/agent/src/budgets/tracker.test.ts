import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { BudgetExceededError, createEventBus } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { createAgent } from '../create-agent.ts';
import { createBudgetTracker } from './tracker.ts';

describe('BudgetTracker', () => {
  test('passes when under budget', () => {
    const tracker = createBudgetTracker({ tokens: 1000 });
    tracker.update({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(() => tracker.check()).not.toThrow();
  });

  test('throws BudgetExceededError when token limit exceeded', () => {
    const tracker = createBudgetTracker({ tokens: 10 });
    tracker.update({ inputTokens: 8, outputTokens: 5, totalTokens: 13 });
    expect(() => tracker.check()).toThrow(BudgetExceededError);
  });

  test('tracks remaining budget', () => {
    const tracker = createBudgetTracker({ tokens: 100, usd: 1.0 });
    tracker.update({ inputTokens: 10, outputTokens: 10, totalTokens: 20 });
    expect(tracker.remaining().tokens).toBe(80);
  });
});

describe('budget integration with createAgent', () => {
  test('agent aborts when token budget exceeded', async () => {
    const highUsage: StreamEvent[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', tokens: { inputTokens: 50, outputTokens: 50, totalTokens: 100 } },
      { type: 'finish', reason: 'stop' },
    ];

    const provider = fakeProvider([{ events: highUsage }]);
    const agent = createAgent({
      provider,
      budgets: { tokens: 10 },
    });

    await expect(agent.run({ userMessage: 'Hi' })).rejects.toThrow(BudgetExceededError);
  });

  test('budget.exceeded event emitted', async () => {
    const bus = createEventBus();
    const exceeded: unknown[] = [];
    bus.on('budget.exceeded', (e) => exceeded.push(e));

    const highUsage: StreamEvent[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', tokens: { inputTokens: 50, outputTokens: 50, totalTokens: 100 } },
      { type: 'finish', reason: 'stop' },
    ];

    const provider = fakeProvider([{ events: highUsage }]);
    const agent = createAgent({
      provider,
      budgets: { tokens: 10 },
      events: bus,
    });

    try {
      await agent.run({ userMessage: 'Hi' });
    } catch {
      // expected
    }

    expect(exceeded.length).toBeGreaterThan(0);
  });
});
