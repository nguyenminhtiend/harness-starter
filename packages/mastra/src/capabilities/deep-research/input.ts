import { z } from 'zod';

export const DeepResearchInput = z.object({
  question: z.string().min(1),
});

export type DeepResearchInput = z.infer<typeof DeepResearchInput>;

export const DeepResearchOutput = z.object({
  reportText: z.string(),
});

export type DeepResearchOutput = z.infer<typeof DeepResearchOutput>;
