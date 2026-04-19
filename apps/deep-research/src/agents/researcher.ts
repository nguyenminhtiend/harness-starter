import type { ConversationStore, Tool } from '@harness/agent';
import { createAgent, inMemoryStore, subagentAsTool } from '@harness/agent';
import type { EventBus, Provider } from '@harness/core';
import { fetchTool } from '@harness/tools';

const SYSTEM_PROMPT = `You are a deep research assistant. Given a question, you:

1. Break it into subquestions
2. Use the fetch tool to search the web for each subquestion (try URLs like https://en.wikipedia.org/wiki/<topic>, https://news.ycombinator.com, or search engine results pages)
3. Synthesize your findings into a well-structured markdown report

Your output must be a markdown report with:
- A clear title (h1)
- Multiple sections (h2) covering different aspects of the question
- Inline citations using [n] notation
- A References section at the end listing all URLs you fetched, numbered to match citations

Be thorough but concise. Cite every factual claim.`;

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

/** @deprecated Use createResearcherTool() for subagent-based research */
export function createResearchAgent(provider: Provider) {
  return createAgent({
    provider,
    systemPrompt: SYSTEM_PROMPT,
    tools: [
      fetchTool({
        allow: [/.*/],
      }) as Tool,
    ],
    memory: inMemoryStore(),
    maxTurns: 15,
  });
}

export interface ResearcherOpts {
  memory?: ConversationStore | undefined;
  budgets?: { usd?: number; tokens?: number } | undefined;
  events?: EventBus | undefined;
}

export function createResearcherTool(
  provider: Provider,
  tools: Tool[],
  opts?: ResearcherOpts,
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
