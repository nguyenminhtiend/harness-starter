import type { Tool } from '@harness/agent';
import { createAgent, inMemoryStore, subagentAsTool } from '@harness/agent';
import type { Provider } from '@harness/core';
import type { BaseAgentOpts } from './types.ts';

const SUBQUESTION_PROMPT = `You are a focused research assistant. You receive a single subquestion to investigate.

1. Use the fetch tool to search for relevant information (try HTTPS URLs: Wikipedia, news sites, docs, etc.)
2. Gather facts from multiple sources when possible
3. Summarize your findings concisely

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "subquestionId": "<id from the input, e.g. q1>",
  "summary": "<concise summary of what you found>",
  "sourceUrls": ["<url1>", "<url2>"]
}

Focus exclusively on the specific subquestion given. Do not go beyond its scope.`;

export function createResearcherTool(
  provider: Provider,
  tools: Tool[],
  opts?: BaseAgentOpts,
): Tool {
  const agent = createAgent({
    provider,
    systemPrompt: SUBQUESTION_PROMPT,
    tools,
    memory: opts?.memory ?? inMemoryStore(),
    maxTurns: 15,
    ...(opts?.budgets ? { budgets: opts.budgets } : {}),
    ...(opts?.events ? { events: opts.events } : {}),
  });

  return subagentAsTool(agent, {
    name: 'researcher',
    description:
      'Researches a specific subquestion using web search. Input: the subquestion text. Returns JSON with findings.',
  }) as Tool;
}
