import type { Agent, ConversationStore } from '@harness/agent';
import { createAgent, inMemoryStore, summarizingCompactor } from '@harness/agent';
import type { Provider } from '@harness/core';

const WRITER_PROMPT = `You are a report writer. You receive research findings and synthesize them into a structured report.

Respond with ONLY valid JSON (no markdown fences, no explanation) matching this schema:
{
  "title": "<clear, descriptive report title>",
  "sections": [
    { "heading": "<section heading>", "body": "<section content with inline [n] citations>" }
  ],
  "references": [
    { "url": "<source URL>", "title": "<optional human-readable title>" }
  ]
}

Guidelines:
- Organize findings into logical sections with clear headings
- Use inline [n] citations that map to the references array (1-indexed)
- Every factual claim must have a citation
- Be thorough but concise — no filler or repetition
- The references array must include every URL cited in the report`;

export function createWriterAgent(provider: Provider, memory?: ConversationStore): Agent {
  return createAgent({
    provider,
    systemPrompt: WRITER_PROMPT,
    compactor: summarizingCompactor(),
    memory: memory ?? inMemoryStore(),
    maxTurns: 3,
  });
}
