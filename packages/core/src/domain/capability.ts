import type { z } from 'zod';
import type { Logger } from '../infra/logger.ts';
import type { ApprovalRequester } from './approval.ts';
import type { StreamEventPayload } from './session-event.ts';

export type { Logger } from '../infra/logger.ts';

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

export type CapabilityRunner = (
  input: unknown,
  ctx: ExecutionContext,
) => AsyncIterable<StreamEventPayload>;

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
