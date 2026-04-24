import { z } from 'zod';
import { ApprovalDecision } from './approval.ts';

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export type TokenUsageDTO = z.infer<typeof TokenUsageSchema>;

export const ErrorShape = z.object({
  code: z.string(),
  message: z.string(),
});

export type ErrorShape = z.infer<typeof ErrorShape>;

const BaseEvent = z.object({
  runId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  ts: z.string().datetime(),
});

export const SessionEvent = z.discriminatedUnion('type', [
  BaseEvent.extend({
    type: z.literal('run.started'),
    capabilityId: z.string(),
    input: z.unknown(),
  }),
  BaseEvent.extend({
    type: z.literal('text.delta'),
    text: z.string(),
  }),
  BaseEvent.extend({
    type: z.literal('reasoning.delta'),
    text: z.string(),
  }),
  BaseEvent.extend({
    type: z.literal('tool.called'),
    tool: z.string(),
    args: z.unknown(),
    callId: z.string(),
  }),
  BaseEvent.extend({
    type: z.literal('tool.result'),
    callId: z.string(),
    result: z.unknown(),
  }),
  BaseEvent.extend({
    type: z.literal('step.finished'),
    usage: TokenUsageSchema.optional(),
  }),
  BaseEvent.extend({
    type: z.literal('plan.proposed'),
    plan: z.unknown(),
  }),
  BaseEvent.extend({
    type: z.literal('approval.requested'),
    approvalId: z.string(),
    payload: z.unknown(),
  }),
  BaseEvent.extend({
    type: z.literal('approval.resolved'),
    approvalId: z.string(),
    decision: ApprovalDecision,
  }),
  BaseEvent.extend({
    type: z.literal('artifact'),
    name: z.string(),
    data: z.unknown(),
  }),
  BaseEvent.extend({
    type: z.literal('usage'),
    usage: TokenUsageSchema,
  }),
  BaseEvent.extend({
    type: z.literal('run.completed'),
    output: z.unknown(),
  }),
  BaseEvent.extend({
    type: z.literal('run.failed'),
    error: ErrorShape,
  }),
  BaseEvent.extend({
    type: z.literal('run.cancelled'),
    reason: z.string().optional(),
  }),
]);

export type SessionEvent = z.infer<typeof SessionEvent>;

export type SessionEventType = SessionEvent['type'];
