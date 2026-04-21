import { z } from 'zod';
import type { ToolDef } from '../types.ts';
import { splitBudget } from './budgets.ts';
import { createResearchGraph } from './graph.ts';
import { createSearchTools } from './search.ts';

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
  hitl: z.boolean().default(false),
  plannerPrompt: z.string().optional(),
  writerPrompt: z.string().optional(),
  factCheckerPrompt: z.string().optional(),
});

type DeepResearchSettings = z.infer<typeof settingsSchema>;

export const deepResearchToolDef: ToolDef<typeof settingsSchema> = {
  id: 'deep-research',
  title: 'Deep Research',
  description:
    'Multi-step research agent: plans subquestions, researches each, writes a report, and fact-checks citations.',
  settingsSchema,
  defaultSettings: settingsSchema.parse({}),
  buildAgent(args) {
    const s = args.settings as DeepResearchSettings;
    const budgets = splitBudget({ usd: s.budgetUsd, tokens: s.maxTokens });

    const toolsPromise = createSearchTools({
      signal: args.signal,
    });

    const agentPromise = toolsPromise.then((tools) =>
      createResearchGraph({
        provider: args.provider,
        tools,
        depth: s.depth,
        skipApproval: !s.hitl,
        checkpointer: args.checkpointer,
        store: args.store,
        budgets,
        events: args.bus,
        plannerPrompt: nonEmpty(s.plannerPrompt),
        writerPrompt: nonEmpty(s.writerPrompt),
        factCheckerPrompt: nonEmpty(s.factCheckerPrompt),
      }),
    );

    return {
      stream(input, opts) {
        async function* gen() {
          const agent = await agentPromise;
          yield* agent.stream(input, opts);
        }
        return gen();
      },
      async run(input, opts) {
        const agent = await agentPromise;
        return agent.run(input, opts);
      },
    };
  },
};
