import { beforeAll, describe, expect, test } from 'bun:test';
import { resolveModel } from '@harness/core';
import {
  createFaithfulnessScorer,
  createHallucinationScorer,
} from '@mastra/evals/scorers/prebuilt';
import { generateReport } from './report-step.ts';
import type { Finding } from './schemas.ts';

const SKIP = !process.env.HARNESS_EVAL;

describe.skipIf(SKIP)('[eval] deepResearch report generation', () => {
  const targetModelId = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
  const judgeModelId = process.env.MASTRA_JUDGE_MODEL ?? 'ollama:qwen2.5:14b';
  const targetModel = resolveModel(targetModelId);
  const judgeModel = resolveModel(judgeModelId);

  const findings: Finding[] = [
    {
      subquestionId: 'sq1',
      summary: 'Paris is the capital of France, located on the Seine river.',
      sourceUrls: ['https://en.wikipedia.org/wiki/Paris'],
    },
    {
      subquestionId: 'sq2',
      summary: 'The Eiffel Tower was built in 1889 for the World Fair and stands 330 meters tall.',
      sourceUrls: ['https://en.wikipedia.org/wiki/Eiffel_Tower'],
    },
  ];

  const context = findings.map((f) => f.summary);

  let reportText: string;

  beforeAll(async () => {
    reportText = await generateReport({ model: targetModel, findings });
    console.log(`  [eval] generated report (${reportText.length} chars)`);
  }, 120_000);

  test('faithfulness > 0.7 against source findings', async () => {
    const scorer = createFaithfulnessScorer({ model: judgeModel });
    const result = await scorer.run({
      output: [
        {
          id: '1',
          createdAt: new Date(),
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: reportText }],
        },
      ],
      additionalContext: { context },
    });

    console.log(`  [eval] faithfulness=${result.score}`);
    expect(result.score).toBeGreaterThan(0.7);
  }, 120_000);

  test('hallucination < 0.3 relative to source findings', async () => {
    const scorer = createHallucinationScorer({ model: judgeModel });
    const result = await scorer.run({
      output: [
        {
          id: '1',
          createdAt: new Date(),
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: reportText }],
        },
      ],
      additionalContext: { context },
    });

    console.log(`  [eval] hallucination=${result.score}`);
    expect(result.score).toBeLessThan(0.3);
  }, 120_000);
});
