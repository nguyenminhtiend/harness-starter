import type { EventBus, Usage } from '@harness/core';
import { BudgetExceededError } from '@harness/core';

export interface BudgetLimits {
  usd?: number | undefined;
  tokens?: number | undefined;
}

export interface BudgetTracker {
  check(): void;
  update(usage: Usage): void;
  spent(): { usd: number; tokens: number };
  remaining(): { usd: number | undefined; tokens: number | undefined };
}

export function createBudgetTracker(limits: BudgetLimits, bus?: EventBus): BudgetTracker {
  let spentUsd = 0;
  let spentTokens = 0;

  function check(): void {
    if (limits.usd != null && spentUsd >= limits.usd) {
      throw new BudgetExceededError(
        `USD budget exceeded: spent $${spentUsd.toFixed(4)}, limit $${limits.usd.toFixed(4)}`,
        { kind: 'usd', spent: spentUsd, limit: limits.usd },
      );
    }
    if (limits.tokens != null && spentTokens >= limits.tokens) {
      throw new BudgetExceededError(
        `Token budget exceeded: used ${spentTokens}, limit ${limits.tokens}`,
        { kind: 'tokens', spent: spentTokens, limit: limits.tokens },
      );
    }
  }

  function update(usage: Usage): void {
    spentTokens += usage.totalTokens ?? 0;
  }

  function spent() {
    return { usd: spentUsd, tokens: spentTokens };
  }

  function remaining() {
    return {
      usd: limits.usd != null ? Math.max(0, limits.usd - spentUsd) : undefined,
      tokens: limits.tokens != null ? Math.max(0, limits.tokens - spentTokens) : undefined,
    };
  }

  if (bus) {
    bus.on('provider.usage', (e) => {
      if (e.costUSD != null) {
        spentUsd += e.costUSD;
        check();
      }
    });
  }

  return { check, update, spent, remaining };
}
