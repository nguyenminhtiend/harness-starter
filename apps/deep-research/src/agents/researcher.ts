import type { Tool } from '@harness/agent';
import { createAgent, inMemoryStore } from '@harness/agent';
import type { Provider } from '@harness/core';
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
