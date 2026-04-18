import type { Provider } from '@harness/core';
import { z } from 'zod';
import { createScorer } from '../create-scorer.ts';

const JudgeResponseSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
});

export interface LlmJudgeOpts {
  provider: Provider;
  prompt: string;
}

export function llmJudge(opts: LlmJudgeOpts) {
  return createScorer<string, string, string>({
    name: 'llmJudge',
    description: 'Uses an LLM to judge output quality on a 0-1 scale.',
    scorer: async ({ input, output, expected }) => {
      const judgePrompt = opts.prompt
        .replace('{{input}}', String(input ?? ''))
        .replace('{{output}}', String(output ?? ''))
        .replace('{{expected}}', String(expected ?? ''));

      const result = await opts.provider.generate({
        messages: [{ role: 'user', content: [{ type: 'text', text: judgePrompt }] }],
        responseFormat: JudgeResponseSchema,
      });

      const text =
        typeof result.message.content === 'string'
          ? result.message.content
          : result.message.content
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('');

      const parsed = JudgeResponseSchema.parse(JSON.parse(text));
      return { score: parsed.score, metadata: { rationale: parsed.rationale } };
    },
  });
}
