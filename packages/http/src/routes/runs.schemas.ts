import { z } from 'zod';

const RunStatus = z.enum(['pending', 'running', 'suspended', 'completed', 'failed', 'cancelled']);

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
