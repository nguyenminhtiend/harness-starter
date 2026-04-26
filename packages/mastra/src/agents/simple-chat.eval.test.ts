import { describe, expect, test } from 'bun:test';
import { resolveModel } from '@harness/core';
import { runEvals } from '@mastra/core/evals';
import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt';
import { createSimpleChatAgent } from './simple-chat.ts';

const SKIP = !process.env.HARNESS_EVAL;

describe.skipIf(SKIP)('[eval] simpleChatAgent', () => {
  const modelId = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
  const model = resolveModel(modelId);

  test('answer relevancy scores above 0.5 for on-topic questions', async () => {
    const agent = createSimpleChatAgent({ model, scorers: {} });
    const relevancyScorer = createAnswerRelevancyScorer({ model });

    const result = await runEvals({
      target: agent,
      scorers: [relevancyScorer],
      data: [
        { input: 'What is 2 + 2?' },
        { input: 'What time is it right now?' },
        { input: 'Hello, how are you?' },
      ],
      targetOptions: { maxSteps: 5 },
      onItemComplete: ({ item, scorerResults }) => {
        const input = typeof item.input === 'string' ? item.input : JSON.stringify(item.input);
        const score = scorerResults['answer-relevancy-scorer']?.score ?? 'N/A';
        console.log(`  [eval] "${input}" → relevancy=${score}`);
      },
    });

    const scores = result.scores;
    for (const [scorerId, scoreData] of Object.entries(scores)) {
      const avg =
        typeof scoreData === 'object' && scoreData !== null && 'averageScore' in scoreData
          ? (scoreData as { averageScore: number }).averageScore
          : undefined;
      if (avg !== undefined) {
        console.log(`  [eval] ${scorerId} avg=${avg}`);
        expect(avg).toBeGreaterThan(0.5);
      }
    }
  }, 120_000);
});
