import { fetchTool } from '@harness/tools';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { StepLogger } from '../lib/logged-step.ts';
import { startStepLog } from '../lib/logged-step.ts';
import { extractJson } from './json.ts';
import { Finding, ResearchPlan, type Subquestion } from './schemas.ts';

const RESEARCHER_INSTRUCTIONS = `You are a focused research assistant. You receive a single subquestion to investigate.

1. Use the fetch tool to gather information from HTTPS sources (Wikipedia, documentation, news, etc.).
2. Pull facts from multiple sources when possible.
3. Summarize your findings concisely.

Respond with ONLY valid JSON (no markdown fences):
{
  "subquestionId": "<id from the input>",
  "summary": "<concise summary>",
  "sourceUrls": ["<url1>", "<url2>"]
}

Stay within the scope of the subquestion.`;

export interface ResearchSubquestionOptions {
  model: MastraModelConfig;
  subquestion: Subquestion;
  systemPrompt?: string;
  maxSteps?: number;
  logger?: StepLogger | undefined;
}

export async function researchSubquestion(opts: ResearchSubquestionOptions): Promise<Finding> {
  const agent = new Agent({
    id: 'deep-research-researcher',
    name: 'Deep Research Researcher',
    instructions: opts.systemPrompt ?? RESEARCHER_INSTRUCTIONS,
    model: opts.model,
    tools: { fetch: fetchTool() },
  });

  opts.logger?.info(
    { agentId: 'deep-research-researcher', subquestionId: opts.subquestion.id },
    'agent.start',
  );
  const result = await agent.generate(`[${opts.subquestion.id}] ${opts.subquestion.question}`, {
    maxSteps: opts.maxSteps ?? 15,
  });
  opts.logger?.info(
    { agentId: 'deep-research-researcher', subquestionId: opts.subquestion.id },
    'agent.finish',
  );

  const text = typeof result.text === 'string' ? result.text : '';
  try {
    const parsed = JSON.parse(extractJson(text));
    return Finding.parse({
      subquestionId: opts.subquestion.id,
      summary: typeof parsed.summary === 'string' ? parsed.summary : text,
      sourceUrls: Array.isArray(parsed.sourceUrls) ? parsed.sourceUrls : [],
    });
  } catch {
    return Finding.parse({
      subquestionId: opts.subquestion.id,
      summary: text,
      sourceUrls: [],
    });
  }
}

export interface CreateResearchStepOptions {
  model: MastraModelConfig;
  concurrency?: number;
  systemPrompt?: string;
  logger?: StepLogger | undefined;
}

const researchInputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
});

const researchOutputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
  findings: z.array(Finding),
});

export function createResearchStep(opts: CreateResearchStepOptions) {
  return createStep({
    id: 'research',
    description: 'Run a sub-agent per subquestion and gather findings.',
    inputSchema: researchInputSchema,
    outputSchema: researchOutputSchema,
    execute: async ({ inputData }) => {
      const timer = startStepLog(opts.logger, 'research');
      try {
        const findings = await Promise.all(
          inputData.plan.subquestions.map((sq) =>
            researchSubquestion({
              model: opts.model,
              subquestion: sq,
              ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
              logger: opts.logger,
            }),
          ),
        );
        timer.end('success');
        return { question: inputData.question, plan: inputData.plan, findings };
      } catch (err) {
        timer.end('error');
        throw err;
      }
    },
  });
}
