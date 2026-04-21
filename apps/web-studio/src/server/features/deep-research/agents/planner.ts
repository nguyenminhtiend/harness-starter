import type { GraphNode } from '@harness/agent';
import type { Provider } from '@harness/core';
import { messageTextContent, parseModelJson } from '../lib/parse-json.ts';
import { ResearchPlan } from '../schemas/plan.ts';

const DEPTH_MAP: Record<string, number> = {
  shallow: 3,
  medium: 5,
  deep: 8,
};

const PLANNER_PROMPT = `You are a research planning assistant. Given a question, decompose it into focused subquestions for deep research.

Each subquestion should be specific, non-overlapping, and directly researchable via web search.`;

export interface PlannerNodeOpts {
  depth?: string | undefined;
  systemPrompt?: string | undefined;
}

export function createPlannerNode(provider: Provider, opts: PlannerNodeOpts = {}): GraphNode {
  const depth = opts.depth ?? 'medium';
  const systemPrompt = opts.systemPrompt ?? PLANNER_PROMPT;
  const targetCount = DEPTH_MAP[depth] ?? 5;

  return {
    id: 'plan',
    fn: async (state, ctx) => {
      const question = state.userMessage as string;

      const result = await provider.generate(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `<user_question>${question}</user_question>\n\nGenerate exactly ${targetCount} subquestions.`,
            },
          ],
          responseFormat: ResearchPlan,
        },
        ctx.signal,
      );

      const text = messageTextContent(result.message.content);
      const plan = parseModelJson(text, ResearchPlan);
      return { ...state, plan };
    },
  };
}
