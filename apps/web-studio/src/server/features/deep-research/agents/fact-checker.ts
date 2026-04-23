import type { EventBus, Provider } from '@harness/core';
import type { UIEvent } from '@harness/session-events';
import { messageTextContent, parseModelJson } from '../lib/parse-json.ts';
import type { FactCheckResult } from '../schemas/fact-check.ts';
import { FactCheckResult as FactCheckResultSchema } from '../schemas/fact-check.ts';

const FACT_CHECKER_PROMPT = `You are a fact-checking assistant. You receive a research report and verify its citations.

For each citation in the report:
1. Check that the cited URL was actually used in the research (provided in context)
2. Check that the claim matches what the source says
3. Flag any unsupported or fabricated citations

Be strict: if any citation cannot be verified, set pass to false.`;

export interface FactCheckerOpts {
  systemPrompt?: string | undefined;
  events?: EventBus;
  pushUIEvent?: (ev: UIEvent) => void;
  runId?: string;
}

export async function checkFacts(
  provider: Provider,
  prompt: string,
  signal: AbortSignal,
  opts?: FactCheckerOpts,
): Promise<FactCheckResult> {
  const runId = opts?.runId ?? 'unknown';
  const messages = [
    { role: 'system' as const, content: opts?.systemPrompt ?? FACT_CHECKER_PROMPT },
    { role: 'user' as const, content: prompt },
  ];

  opts?.pushUIEvent?.({
    type: 'llm',
    ts: Date.now(),
    runId,
    phase: 'request',
    providerId: provider.id,
    messages,
  });
  opts?.events?.emit('provider.call', {
    runId,
    providerId: provider.id,
    request: { messages },
  });

  const result = await provider.generate(
    { messages, responseFormat: FactCheckResultSchema },
    signal,
  );

  const text = messageTextContent(result.message.content);

  opts?.pushUIEvent?.({
    type: 'llm',
    ts: Date.now(),
    runId,
    phase: 'response',
    providerId: provider.id,
    text,
  });

  if (result.usage) {
    opts?.events?.emit('provider.usage', {
      runId,
      tokens: result.usage,
    });
  }

  return parseModelJson(text, FactCheckResultSchema);
}
