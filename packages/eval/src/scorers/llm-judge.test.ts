import { describe, expect, test } from 'bun:test';
import { fakeProvider } from '@harness/core/testing';
import { llmJudge } from './llm-judge.ts';

describe('llmJudge', () => {
  test('returns score and rationale from provider', async () => {
    const response = JSON.stringify({ score: 0.8, rationale: 'Good answer' });
    const provider = fakeProvider([
      {
        events: [
          { type: 'text-delta', delta: response },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ]);

    const scorer = llmJudge({
      provider,
      prompt: 'Rate this: input={{input}} output={{output}} expected={{expected}}',
    });

    const result = await scorer({ input: 'question', output: 'answer', expected: 'ideal' });
    expect(result.score).toBe(0.8);
    expect(result.metadata).toEqual({ rationale: 'Good answer' });
  });

  test('returns 0 score when judge says 0', async () => {
    const response = JSON.stringify({ score: 0, rationale: 'Completely wrong' });
    const provider = fakeProvider([
      {
        events: [
          { type: 'text-delta', delta: response },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ]);

    const scorer = llmJudge({ provider, prompt: '{{output}} vs {{expected}}' });
    const result = await scorer({ input: 'q', output: 'bad', expected: 'good' });
    expect(result.score).toBe(0);
    expect(result.metadata).toEqual({ rationale: 'Completely wrong' });
  });

  test('returns 1 score for perfect', async () => {
    const response = JSON.stringify({ score: 1, rationale: 'Perfect match' });
    const provider = fakeProvider([
      {
        events: [
          { type: 'text-delta', delta: response },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ]);

    const scorer = llmJudge({ provider, prompt: '{{output}}' });
    const result = await scorer({ input: '', output: 'correct', expected: 'correct' });
    expect(result.score).toBe(1);
  });
});
