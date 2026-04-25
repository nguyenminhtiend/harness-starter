import { z } from 'zod';

export const DeepResearchSettings = z.object({
  model: z.string().min(1),
  depth: z.string().optional(),
  maxFactCheckRetries: z.number().int().nonnegative().optional(),
  plannerPrompt: z.string().optional(),
  writerPrompt: z.string().optional(),
  factCheckerPrompt: z.string().optional(),
});

export type DeepResearchSettings = z.infer<typeof DeepResearchSettings>;
