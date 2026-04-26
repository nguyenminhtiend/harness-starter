import { describe, expect, test } from 'bun:test';
import { resolveModel } from '@harness/core';
import { defaultWorkflowScorers } from '../../evals/index.ts';

const SKIP = !process.env.HARNESS_EVAL;

describe.skipIf(SKIP)('[eval] deepResearch workflow scorers', () => {
  const modelId = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
  const model = resolveModel(modelId);

  test('defaultWorkflowScorers constructs faithfulness and hallucination scorers', () => {
    const scorers = defaultWorkflowScorers(model);
    expect(scorers.faithfulness).toBeDefined();
    expect(scorers.hallucination).toBeDefined();
    expect(scorers.faithfulness.scorer.id).toBe('faithfulness-scorer');
    expect(scorers.hallucination.scorer.id).toBe('hallucination-scorer');
  });

  test('faithfulness scorer runs on a synthetic input/output pair', async () => {
    const scorers = defaultWorkflowScorers(model);
    const result = await scorers.faithfulness.scorer.run({
      output: [
        {
          id: '1',
          createdAt: new Date(),
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Paris is the capital of France. It is known for the Eiffel Tower.',
            },
          ],
        },
      ],
      additionalContext: {
        context: ['Paris is the capital of France.', 'The Eiffel Tower is in Paris.'],
      },
    });
    console.log(`  [eval] faithfulness score=${result.score}`);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  }, 120_000);
});
