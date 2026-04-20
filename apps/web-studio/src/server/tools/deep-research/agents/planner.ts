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

const MAX_PLAN_RETRIES = 3;

export function createPlannerNode(provider: Provider, depth = 'medium'): GraphNode {
  const targetCount = DEPTH_MAP[depth] ?? 5;

  return {
    id: 'plan',
    fn: async (state, ctx) => {
      const question = state.userMessage as string;

      for (let attempt = 0; attempt < MAX_PLAN_RETRIES; attempt++) {
        const retryHint =
          attempt > 0
            ? '\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY valid JSON, no explanation or markdown fences.'
            : '';

        const result = await provider.generate(
          {
            messages: [
              { role: 'system', content: PLANNER_PROMPT },
              {
                role: 'user',
                content: `<user_question>${question}</user_question>\n\nGenerate exactly ${targetCount} subquestions.${retryHint}`,
              },
            ],
          },
          ctx.signal,
        );

        const text = messageTextContent(result.message.content);
        try {
          const plan = parseModelJson(text, ResearchPlan);
          return { ...state, plan };
        } catch (err) {
          if (attempt === MAX_PLAN_RETRIES - 1) {
            throw err;
          }
        }
      }

      throw new Error('Planner: exhausted retries');
    },
  };
}
