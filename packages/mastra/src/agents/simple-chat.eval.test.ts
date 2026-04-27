import { describe, expect, test } from 'bun:test';
import { resolveModel } from '@harness/core';
import { runEvals } from '@mastra/core/evals';
import {
  createAnswerRelevancyScorer,
  createContentSimilarityScorer,
  createTrajectoryAccuracyScorerCode,
} from '@mastra/evals/scorers/prebuilt';
import { createSimpleChatAgent } from './simple-chat.ts';

const SKIP = !process.env.HARNESS_EVAL;

describe.skipIf(SKIP)('[eval] simpleChatAgent', () => {
  const targetModelId = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
  const judgeModelId = process.env.MASTRA_JUDGE_MODEL ?? 'ollama:qwen2.5:14b';
  const targetModel = resolveModel(targetModelId);
  const judgeModel = resolveModel(judgeModelId);

  test('relevancy > 0.8 and correct tool-call trajectory', async () => {
    const agent = createSimpleChatAgent({ model: targetModel, scorers: {} });

    const result = await runEvals({
      target: agent,
      scorers: {
        agent: [
          createAnswerRelevancyScorer({ model: judgeModel }),
          createContentSimilarityScorer({ ignoreCase: true }),
        ],
        trajectory: [
          createTrajectoryAccuracyScorerCode({
            comparisonOptions: { ordering: 'relaxed', allowRepeatedSteps: true },
          }),
        ],
      },
      data: [
        {
          input: 'What is 2 + 2?',
          groundTruth: '4',
          expectedTrajectory: [{ name: 'calculator', stepType: 'tool_call' }],
        },
        {
          input: 'What time is it right now?',
          expectedTrajectory: [{ name: 'get_time', stepType: 'tool_call' }],
        },
        {
          input: 'Hello, how are you?',
          expectedTrajectory: [],
        },
      ],
      targetOptions: { maxSteps: 5 },
      concurrency: 3,
      onItemComplete: ({ item, scorerResults }) => {
        const input = typeof item.input === 'string' ? item.input : JSON.stringify(item.input);
        console.log(`  [eval] "${input}" →`, JSON.stringify(scorerResults, null, 2));
      },
    });

    console.log(`  [eval] summary: ${result.summary.totalItems} items`);

    const agentScores = result.scores['agent'];
    const relevancyAvg = agentScores?.['answer-relevancy-scorer'];
    expect(relevancyAvg).toBeDefined();
    console.log(`  [eval] relevancy avg=${relevancyAvg}`);
    expect(relevancyAvg).toBeGreaterThan(0.8);

    const trajectoryScores = result.scores['trajectory'];
    const trajAvg = trajectoryScores?.['code-trajectory-accuracy-scorer'];
    expect(trajAvg).toBeDefined();
    console.log(`  [eval] trajectory avg=${trajAvg}`);
    expect(trajAvg).toBeGreaterThan(0.7);
  }, 240_000);
});
