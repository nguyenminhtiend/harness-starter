import { z } from 'zod';

const RunStatus = z.enum(['pending', 'running', 'suspended', 'completed', 'failed', 'cancelled']);

export const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export const OkResponse = z.object({ ok: z.boolean() });

export const ListRunsQuery = z.object({
  status: RunStatus.optional(),
  capabilityId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const StartRunBody = z.object({
  capabilityId: z.string().min(1),
  input: z.unknown(),
  settings: z.unknown().optional(),
  conversationId: z.string().optional(),
});

export const ApproveBody = z.object({
  approvalId: z.string().min(1),
  editedPlan: z.unknown().optional(),
});

export const RejectBody = z.object({
  approvalId: z.string().min(1),
  reason: z.string().optional(),
});
