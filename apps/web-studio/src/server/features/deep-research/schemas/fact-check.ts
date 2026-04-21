import { z } from 'zod';

export const FactCheckResult = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()).default([]),
});

export type FactCheckResult = z.infer<typeof FactCheckResult>;
