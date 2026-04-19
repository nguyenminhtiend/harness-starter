import { describe, expect, it } from 'bun:test';
import { ResearchPlan, Subquestion } from './plan.ts';

describe('Subquestion schema', () => {
  it('accepts a valid subquestion', () => {
    const result = Subquestion.safeParse({
      id: 'q1',
      question: 'What is CRDT?',
      searchQueries: ['CRDT definition', 'CRDT vs OT'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing question', () => {
    const result = Subquestion.safeParse({ id: 'q1', searchQueries: [] });
    expect(result.success).toBe(false);
  });

  it('defaults searchQueries to empty array', () => {
    const result = Subquestion.safeParse({ id: 'q1', question: 'What?' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.searchQueries).toEqual([]);
    }
  });
});

describe('ResearchPlan schema', () => {
  it('accepts a valid plan with subquestions', () => {
    const result = ResearchPlan.safeParse({
      question: 'CRDTs vs OT?',
      subquestions: [
        { id: 'q1', question: 'What is CRDT?', searchQueries: ['CRDT'] },
        { id: 'q2', question: 'What is OT?', searchQueries: ['OT'] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty subquestions array', () => {
    const result = ResearchPlan.safeParse({
      question: 'Test?',
      subquestions: [],
    });
    expect(result.success).toBe(false);
  });
});
