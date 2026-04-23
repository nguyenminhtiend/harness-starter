import { z } from 'zod';

export const Subquestion = z.object({
  id: z.string(),
  question: z.string(),
});

export const ResearchPlan = z.object({
  summary: z.string(),
  subquestions: z.array(Subquestion).min(1),
});

export const Finding = z.object({
  subquestionId: z.string(),
  summary: z.string(),
  sourceUrls: z.array(z.string()).default([]),
});

export type ResearchPlan = z.infer<typeof ResearchPlan>;
export type Subquestion = z.infer<typeof Subquestion>;
export type Finding = z.infer<typeof Finding>;

export const ResearchStateSchema = z.object({
  question: z.string(),
  plan: ResearchPlan.optional(),
  findings: z.array(Finding).optional(),
  reportText: z.string().optional(),
  factCheckPassed: z.boolean().optional(),
  factCheckIssues: z.array(z.string()).optional(),
  factCheckRetries: z.number().optional(),
});

export type ResearchState = z.infer<typeof ResearchStateSchema>;
