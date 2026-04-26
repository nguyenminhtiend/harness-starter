import { describe, expect, test } from 'bun:test';
import { mockModel } from '../agents/testing.ts';
import { defaultAgentScorers, defaultWorkflowScorers } from './defaults.ts';

describe('defaultAgentScorers', () => {
  test('returns relevancy and similarity scorer entries', () => {
    const model = mockModel([]);
    const scorers = defaultAgentScorers(model);

    expect(scorers).toHaveProperty('relevancy');
    expect(scorers).toHaveProperty('similarity');
    expect(scorers.relevancy.scorer).toBeDefined();
    expect(scorers.similarity.scorer).toBeDefined();
    expect(scorers.relevancy.scorer.id).toBe('answer-relevancy-scorer');
    expect(scorers.similarity.scorer.id).toBe('content-similarity-scorer');
  });
});

describe('defaultWorkflowScorers', () => {
  test('returns faithfulness and hallucination scorer entries', () => {
    const model = mockModel([]);
    const scorers = defaultWorkflowScorers(model);

    expect(scorers).toHaveProperty('faithfulness');
    expect(scorers).toHaveProperty('hallucination');
    expect(scorers.faithfulness.scorer).toBeDefined();
    expect(scorers.hallucination.scorer).toBeDefined();
    expect(scorers.faithfulness.scorer.id).toBe('faithfulness-scorer');
    expect(scorers.hallucination.scorer.id).toBe('hallucination-scorer');
  });
});
