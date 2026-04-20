import { z } from 'zod';

export const Subquestion = z.object({
  id: z.string(),
  question: z.string().min(1),
  searchQueries: z.array(z.string()).default([]),
});

export type Subquestion = z.infer<typeof Subquestion>;

export const ResearchPlan = z.object({
  question: z.string().min(1),
  subquestions: z.array(Subquestion).min(1),
});

export type ResearchPlan = z.infer<typeof ResearchPlan>;
