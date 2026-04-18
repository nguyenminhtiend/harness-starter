import { createScorer } from '../create-scorer.ts';

export interface TimedOutput {
  durationMs: number;
  [key: string]: unknown;
}

export function finishedWithin(limitMs: number) {
  return createScorer<unknown, TimedOutput, unknown>({
    name: 'finishedWithin',
    description: `Returns 1 if the task completed within ${limitMs}ms.`,
    scorer: ({ output }) => {
      const actual = output.durationMs;
      return {
        score: actual <= limitMs ? 1 : 0,
        metadata: { actualMs: actual, limitMs },
      };
    },
  });
}
