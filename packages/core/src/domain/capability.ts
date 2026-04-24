import type { z } from 'zod';
import type { ApprovalRequester } from './approval.ts';

export interface TokenUsage {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
}

export type CapabilityEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'reasoning-delta'; readonly text: string }
  | {
      readonly type: 'tool-called';
      readonly tool: string;
      readonly args: unknown;
      readonly callId: string;
    }
  | { readonly type: 'tool-result'; readonly callId: string; readonly result: unknown }
  | { readonly type: 'step-finished'; readonly usage?: TokenUsage | undefined }
  | { readonly type: 'plan-proposed'; readonly plan: unknown }
  | { readonly type: 'artifact'; readonly name: string; readonly data: unknown }
  | { readonly type: 'usage'; readonly usage: TokenUsage }
  | { readonly type: 'custom'; readonly kind: string; readonly data: unknown };

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
  execute(input: I, ctx: ExecutionContext): AsyncIterable<CapabilityEvent>;
}
