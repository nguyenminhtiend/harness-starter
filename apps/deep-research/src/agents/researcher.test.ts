import { describe, expect, it } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { makeTestCtx, sampleFinding } from '../test-utils.ts';
import { createResearcherTool } from './researcher.ts';

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } },
    { type: 'finish', reason: 'stop' },
  ];
}

const ctx = makeTestCtx();

describe('createResearcherTool', () => {
  it('returns a tool with name "researcher"', () => {
    const provider = fakeProvider([{ events: textScript('{}') }]);
    const tool = createResearcherTool(provider, []);
    expect(tool.name).toBe('researcher');
    expect(tool.description).toBeDefined();
  });

  it('accepts { input: string } parameters', () => {
    const provider = fakeProvider([{ events: textScript('{}') }]);
    const tool = createResearcherTool(provider, []);
    const parsed = tool.parameters.parse({ input: 'What are CRDTs?' });
    expect(parsed).toEqual({ input: 'What are CRDTs?' });
  });

  it('delegates to child agent and returns its response', async () => {
    const responseText = JSON.stringify(sampleFinding);
    const provider = fakeProvider([{ events: textScript(responseText) }]);
    const tool = createResearcherTool(provider, []);

    const result = await tool.execute({ input: 'What are CRDTs?' }, ctx);
    const parsed = JSON.parse(result as string);
    expect(parsed).toMatchObject(sampleFinding);
  });

  it('each invocation gets isolated conversation context', async () => {
    const provider = fakeProvider([
      { events: textScript(JSON.stringify({ ...sampleFinding, subquestionId: 'q1' })) },
      { events: textScript(JSON.stringify({ ...sampleFinding, subquestionId: 'q2' })) },
    ]);
    const tool = createResearcherTool(provider, []);

    const r1 = await tool.execute({ input: 'Question 1' }, ctx);
    const r2 = await tool.execute({ input: 'Question 2' }, ctx);

    expect(JSON.parse(r1).subquestionId).toBe('q1');
    expect(JSON.parse(r2).subquestionId).toBe('q2');
  });
});
