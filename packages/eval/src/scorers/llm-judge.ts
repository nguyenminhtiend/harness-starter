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
      const result = await opts.provider.generate({
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: opts.prompt }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  '=== INPUT ===',
                  String(input ?? ''),
                  '=== OUTPUT ===',
                  String(output ?? ''),
                  '=== EXPECTED ===',
                  String(expected ?? ''),
                ].join('\n'),
              },
            ],
          },
        ],
        responseFormat: JudgeResponseSchema,
      });

      const text =
        typeof result.message.content === 'string'
          ? result.message.content
          : result.message.content
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('');

      try {
        const parsed = JudgeResponseSchema.parse(JSON.parse(text));
        return { score: parsed.score, metadata: { rationale: parsed.rationale } };
      } catch {
        const truncatedRaw = text.length > 500 ? `${text.slice(0, 500)}...[truncated]` : text;
        return {
          score: 0,
          metadata: { rationale: 'Failed to parse judge response', raw: truncatedRaw },
        };
      }
    },
  });
}
