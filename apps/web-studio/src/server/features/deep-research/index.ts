import { z } from 'zod';
import type { MastraWorkflowToolDef } from '../tools/types.ts';

function nonEmpty(v: string | undefined): string | undefined {
  return v !== undefined && v !== '' ? v : undefined;
}

const settingsSchema = z.object({
  model: z.string().default('openrouter/free'),
  depth: z.enum(['shallow', 'medium', 'deep']).default('medium'),
  budgetUsd: z.number().min(0).default(0.5),
  maxTokens: z.number().int().min(1000).default(200_000),
  concurrency: z.number().int().min(1).max(10).default(3),
  ephemeral: z.boolean().default(false),
  hitl: z.boolean().default(true),
  plannerPrompt: z.string().optional(),
  writerPrompt: z.string().optional(),
  factCheckerPrompt: z.string().optional(),
});

export const deepResearchToolDef: MastraWorkflowToolDef<typeof settingsSchema> = {
  id: 'deep-research',
  runtime: 'mastra-workflow',
  title: 'Deep Research',
  description:
    'Multi-step research workflow: plans subquestions, researches each, writes a report, and fact-checks citations.',
  settingsSchema,
  defaultSettings: settingsSchema.parse({}),
  createWorkflowConfig(settings) {
    return {
      model: settings.model,
      depth: settings.depth,
      concurrency: settings.concurrency,
      ...(nonEmpty(settings.plannerPrompt) ? { plannerPrompt: settings.plannerPrompt } : {}),
      ...(nonEmpty(settings.writerPrompt) ? { writerPrompt: settings.writerPrompt } : {}),
      ...(nonEmpty(settings.factCheckerPrompt)
        ? { factCheckerPrompt: settings.factCheckerPrompt }
        : {}),
    };
  },
};
