import type { Agent } from '@mastra/core/agent';
import type { Workflow } from '@mastra/core/workflows';
import type { z } from 'zod';
import type { Logger } from '../observability/logger.ts';
import type { ApprovalRequester } from './approval.ts';

export type { Logger } from '../observability/logger.ts';

export interface MemoryHandle {
  readonly conversationId: string;
}

export interface ExecutionContext {
  readonly runId: string;
  readonly settings: unknown;
  readonly memory: MemoryHandle | null;
  readonly signal: AbortSignal;
  readonly approvals: ApprovalRequester;
  readonly logger: Logger;
}

export type CapabilityRunner =
  | {
      readonly kind: 'agent';
      readonly build: (settings: unknown) => Agent;
      readonly extractPrompt: (input: unknown) => string;
      readonly maxSteps?: number;
    }
  | {
      readonly kind: 'workflow';
      readonly build: (settings: unknown) => Workflow;
      readonly extractInput: (input: unknown) => Record<string, unknown>;
      readonly approveStepId?: string;
      readonly extractPlan?: (steps: Record<string, unknown>) => unknown;
    };

export interface CapabilityDefinition<I = unknown, O = unknown, S = unknown> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly settingsSchema: z.ZodType<S>;
  readonly supportsApproval?: boolean;
  readonly runner: CapabilityRunner;
}
