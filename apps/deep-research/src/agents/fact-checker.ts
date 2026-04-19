import type { Agent } from '@harness/agent';
import { createAgent, inMemoryStore } from '@harness/agent';
import type { Provider } from '@harness/core';

const FACT_CHECKER_PROMPT = `You are a fact-checking assistant. You receive a research report and verify its citations.

For each citation in the report:
1. Check that the cited URL was actually used in the research (provided in context)
2. Check that the claim matches what the source says
3. Flag any unsupported or fabricated citations

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "pass": true/false,
  "issues": [
    "<description of each issue found, or empty array if all citations check out>"
  ]
}

Be strict: if any citation cannot be verified, set pass to false.`;

export function createFactCheckerAgent(provider: Provider): Agent {
  return createAgent({
    provider,
    systemPrompt: FACT_CHECKER_PROMPT,
    memory: inMemoryStore(),
    maxTurns: 3,
  });
}
