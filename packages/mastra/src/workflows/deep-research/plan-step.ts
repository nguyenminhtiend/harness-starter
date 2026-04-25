import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { StepLogger } from '../lib/logged-step.ts';
import { startStepLog } from '../lib/logged-step.ts';
import { extractJson } from './json.ts';
import { ResearchPlan } from './schemas.ts';

const DEPTH_TO_COUNT: Record<string, number> = {
  shallow: 3,
  medium: 5,
  deep: 8,
};

const PLANNER_INSTRUCTIONS = `You are a research planning assistant. Given a question, decompose it into focused subquestions for deep research.

Each subquestion must be specific, non-overlapping, and directly researchable via web search.

Respond with ONLY valid JSON (no markdown fences) matching this exact schema:
{
  "summary": "Brief overview of the research plan",
  "subquestions": [
    { "id": "sq1", "question": "First specific subquestion?" },
    { "id": "sq2", "question": "Second specific subquestion?" }
  ]
}

IMPORTANT: Each item in "subquestions" MUST be an object with "id" and "question" fields, NOT a plain string.`;

export interface GeneratePlanOptions {
  model: MastraModelConfig;
  question: string;
  depth?: string;
  systemPrompt?: string;
  logger?: StepLogger | undefined;
}

export async function generatePlan(opts: GeneratePlanOptions): Promise<ResearchPlan> {
  const depth = opts.depth ?? 'medium';
  const targetCount = DEPTH_TO_COUNT[depth] ?? 5;
  const agent = new Agent({
    id: 'deep-research-planner',
    name: 'Deep Research Planner',
    instructions: opts.systemPrompt ?? PLANNER_INSTRUCTIONS,
    model: opts.model,
  });

  opts.logger?.info({ agentId: 'deep-research-planner' }, 'agent.start');
  const result = await agent.generate(
    `<user_question>${opts.question}</user_question>\n\nGenerate exactly ${targetCount} subquestions.`,
  );
  opts.logger?.info({ agentId: 'deep-research-planner' }, 'agent.finish');
  const raw = typeof result.text === 'string' ? result.text : '';
  const parsed = JSON.parse(extractJson(raw));
  if (Array.isArray(parsed.subquestions)) {
    parsed.subquestions = parsed.subquestions.map((sq: unknown, i: number) =>
      typeof sq === 'string' ? { id: `sq${i + 1}`, question: sq } : sq,
    );
  }
  return ResearchPlan.parse(parsed);
}

export interface CreatePlanStepOptions {
  model: MastraModelConfig;
  depth?: string;
  systemPrompt?: string;
  logger?: StepLogger | undefined;
}

const planInputSchema = z.object({
  question: z.string(),
  depth: z.enum(['shallow', 'medium', 'deep']).optional(),
});

const planOutputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
});

export function createPlanStep(opts: CreatePlanStepOptions) {
  return createStep({
    id: 'plan',
    description: 'Decompose the user question into researchable subquestions.',
    inputSchema: planInputSchema,
    outputSchema: planOutputSchema,
    execute: async ({ inputData }) => {
      const timer = startStepLog(opts.logger, 'plan');
      try {
        const depth = inputData.depth ?? opts.depth;
        const plan = await generatePlan({
          model: opts.model,
          question: inputData.question,
          ...(depth ? { depth } : {}),
          ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
          logger: opts.logger,
        });
        timer.end('success');
        return { question: inputData.question, plan };
      } catch (err) {
        timer.end('error');
        throw err;
      }
    },
  });
}
