import type { ConversationStore } from '@harness/agent';
import type { EventBus } from '@harness/core';
import type { BudgetLimits } from '../budgets.ts';

export interface BaseAgentOpts {
  memory?: ConversationStore | undefined;
  budgets?: BudgetLimits | undefined;
  events?: EventBus | undefined;
  /** When set, replaces the built-in system prompt for this agent. */
  systemPrompt?: string | undefined;
}
