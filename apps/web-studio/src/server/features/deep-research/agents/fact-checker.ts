import type { Provider } from '@harness/core';
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
}

export async function checkFacts(
  provider: Provider,
  prompt: string,
  signal: AbortSignal,
  opts?: FactCheckerOpts,
): Promise<FactCheckResult> {
  const result = await provider.generate(
    {
      messages: [
        { role: 'system', content: opts?.systemPrompt ?? FACT_CHECKER_PROMPT },
        { role: 'user', content: prompt },
      ],
      responseFormat: FactCheckResultSchema,
    },
    signal,
  );

  const text =
    typeof result.message.content === 'string'
      ? result.message.content
      : result.message.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('');

  return FactCheckResultSchema.parse(JSON.parse(text));
}
