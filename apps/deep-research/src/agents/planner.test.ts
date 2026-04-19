import { describe, expect, it } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { makeTestCtx } from '../test-utils.ts';
import { createPlannerNode } from './planner.ts';

function planResponse(plan: object): StreamEvent[] {
  return [
    { type: 'text-delta', delta: JSON.stringify(plan) },
    { type: 'usage', tokens: { inputTokens: 50, outputTokens: 30, totalTokens: 80 } },
    { type: 'finish', reason: 'stop' },
  ];
}

const samplePlan = {
  question: 'What is CRDT?',
  subquestions: [
    { id: 'q1', question: 'What are CRDTs?', searchQueries: ['CRDT definition'] },
    { id: 'q2', question: 'How do CRDTs compare to OT?', searchQueries: ['CRDT vs OT'] },
    { id: 'q3', question: 'Where are CRDTs used?', searchQueries: ['CRDT applications'] },
  ],
};

const ctx = makeTestCtx();

describe('createPlannerNode', () => {
  it('parses a valid plan from provider response', async () => {
    const provider = fakeProvider([{ events: planResponse(samplePlan) }]);
    const node = createPlannerNode(provider);

    const fn = node.fn as NonNullable<typeof node.fn>;
    const result = await fn({ userMessage: 'What is CRDT?' }, ctx);
    expect(result.plan).toEqual(samplePlan);
  });

  it('extracts JSON from fenced code blocks', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(samplePlan)}\n\`\`\``;
    const provider = fakeProvider([
      {
        events: [
          { type: 'text-delta', delta: fenced },
          { type: 'usage', tokens: { inputTokens: 50, outputTokens: 30, totalTokens: 80 } },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ]);
    const node = createPlannerNode(provider);
    const fn = node.fn as NonNullable<typeof node.fn>;

    const result = await fn({ userMessage: 'What is CRDT?' }, ctx);
    expect(result.plan).toEqual(samplePlan);
  });

  it('throws on invalid JSON response', async () => {
    const provider = fakeProvider([
      {
        events: [
          { type: 'text-delta', delta: 'not json at all' },
          { type: 'usage', tokens: { inputTokens: 50, outputTokens: 10, totalTokens: 60 } },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ]);
    const node = createPlannerNode(provider);
    const fn = node.fn as NonNullable<typeof node.fn>;

    expect(fn({ userMessage: 'test' }, ctx)).rejects.toThrow();
  });

  it('throws on valid JSON that fails schema validation', async () => {
    const provider = fakeProvider([
      {
        events: [
          { type: 'text-delta', delta: '{"question":"test","subquestions":[]}' },
          { type: 'usage', tokens: { inputTokens: 50, outputTokens: 10, totalTokens: 60 } },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ]);
    const node = createPlannerNode(provider);
    const fn = node.fn as NonNullable<typeof node.fn>;

    expect(fn({ userMessage: 'test' }, ctx)).rejects.toThrow();
  });

  it('preserves existing state fields', async () => {
    const provider = fakeProvider([{ events: planResponse(samplePlan) }]);
    const node = createPlannerNode(provider);
    const fn = node.fn as NonNullable<typeof node.fn>;

    const result = await fn({ userMessage: 'What is CRDT?', extra: 42 }, ctx);
    expect(result.extra).toBe(42);
    expect(result.plan).toBeDefined();
  });
});
