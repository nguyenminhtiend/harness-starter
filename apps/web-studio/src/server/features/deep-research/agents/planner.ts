import type { GraphNode } from '@harness/agent';
import type { EventBus, Provider } from '@harness/core';
import type { UIEvent } from '@harness/session-events';
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
  events?: EventBus;
  pushUIEvent?: (ev: UIEvent) => void;
}

export function createPlannerNode(provider: Provider, opts: PlannerNodeOpts = {}): GraphNode {
  const depth = opts.depth ?? 'medium';
  const systemPrompt = opts.systemPrompt ?? PLANNER_PROMPT;
  const targetCount = DEPTH_MAP[depth] ?? 5;
  const { events, pushUIEvent } = opts;

  return {
    id: 'plan',
    fn: async (state, ctx) => {
      const question = state.userMessage as string;
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `<user_question>${question}</user_question>\n\nGenerate exactly ${targetCount} subquestions.`,
        },
      ];

      pushUIEvent?.({
        type: 'llm',
        ts: Date.now(),
        runId: ctx.runId,
        phase: 'request',
        providerId: provider.id,
        messages,
      });
      events?.emit('provider.call', {
        runId: ctx.runId,
        providerId: provider.id,
        request: { messages },
      });

      const started = Date.now();
      const result = await provider.generate(
        { messages, responseFormat: ResearchPlan },
        ctx.signal,
      );

      const text = messageTextContent(result.message.content);

      pushUIEvent?.({
        type: 'llm',
        ts: Date.now(),
        runId: ctx.runId,
        phase: 'response',
        providerId: provider.id,
        text,
      });

      if (result.usage) {
        events?.emit('provider.usage', {
          runId: ctx.runId,
          tokens: result.usage,
        });
      }

      const plan = parseModelJson(text, ResearchPlan);
      pushUIEvent?.({
        type: 'agent',
        ts: Date.now(),
        runId: ctx.runId,
        phase: 'plan',
        message: `planner finished in ${Date.now() - started}ms`,
      });
      return { ...state, plan };
    },
  };
}
