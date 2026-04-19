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

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "question": "<the original question>",
  "subquestions": [
    {
      "id": "q1",
      "question": "<focused subquestion>",
      "searchQueries": ["<search query 1>", "<search query 2>"]
    }
  ]
}

Each subquestion should be specific, non-overlapping, and directly researchable via web search.`;

export function createPlannerNode(provider: Provider, depth = 'medium'): GraphNode {
  const targetCount = DEPTH_MAP[depth] ?? 5;

  return {
    id: 'plan',
    fn: async (state, ctx) => {
      const question = state.userMessage as string;

      const result = await provider.generate(
        {
          messages: [
            { role: 'system', content: PLANNER_PROMPT },
            {
              role: 'user',
              content: `Question: ${question}\n\nGenerate exactly ${targetCount} subquestions.`,
            },
          ],
        },
        ctx.signal,
      );

      const text = messageTextContent(result.message.content);
      const plan = parseModelJson(text, ResearchPlan);
      return { ...state, plan };
    },
  };
}
