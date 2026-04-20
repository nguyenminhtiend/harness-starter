import { z } from 'zod';

export const Finding = z.object({
  subquestionId: z.string(),
  summary: z.string().min(1),
  sourceUrls: z.array(z.string().url()).default([]),
});

export type Finding = z.infer<typeof Finding>;

export const ReportSection = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
});

export type ReportSection = z.infer<typeof ReportSection>;

export const Reference = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

export type Reference = z.infer<typeof Reference>;

export const Report = z.object({
  title: z.string().min(1),
  sections: z.array(ReportSection).min(1),
  references: z.array(Reference).default([]),
});

export type Report = z.infer<typeof Report>;
