import type { z } from 'zod';
import type { ApprovalRequester } from './approval.ts';
import type { StreamEventPayload } from './session-event.ts';

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

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

export interface Capability<I = unknown, O = unknown> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly settingsSchema: z.ZodType;
  readonly supportsApproval?: boolean | undefined;
  execute(input: I, ctx: ExecutionContext): AsyncIterable<StreamEventPayload>;
}
