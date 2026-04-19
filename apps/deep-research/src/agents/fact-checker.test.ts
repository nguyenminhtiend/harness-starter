import { describe, expect, it } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { createFactCheckerAgent } from './fact-checker.ts';

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 50, outputTokens: 80, totalTokens: 130 } },
    { type: 'finish', reason: 'stop' },
  ];
}

const passResult = JSON.stringify({
  pass: true,
  issues: [],
});

const failResult = JSON.stringify({
  pass: false,
  issues: ['Citation [3] references a URL not found in research sources'],
});

describe('createFactCheckerAgent', () => {
  it('returns an agent with run and stream methods', () => {
    const provider = fakeProvider([{ events: textScript(passResult) }]);
    const agent = createFactCheckerAgent(provider);
    expect(agent.run).toBeFunction();
    expect(agent.stream).toBeFunction();
  });

  it('returns pass result when citations are valid', async () => {
    const provider = fakeProvider([{ events: textScript(passResult) }]);
    const agent = createFactCheckerAgent(provider);

    const result = await agent.run({
      userMessage: 'Verify this report: CRDTs are distributed data structures [1]...',
    });

    const parsed = JSON.parse(result.finalMessage as string);
    expect(parsed.pass).toBe(true);
    expect(parsed.issues).toHaveLength(0);
  });

  it('returns fail result with issues when citations are invalid', async () => {
    const provider = fakeProvider([{ events: textScript(failResult) }]);
    const agent = createFactCheckerAgent(provider);

    const result = await agent.run({
      userMessage: 'Verify this report with bad citations...',
    });

    const parsed = JSON.parse(result.finalMessage as string);
    expect(parsed.pass).toBe(false);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it('can be used as a handoff target', async () => {
    const provider = fakeProvider([{ events: textScript(passResult) }]);
    const agent = createFactCheckerAgent(provider);

    const result = await agent.run({
      userMessage: 'Verify citations in the report.',
      conversationId: 'handoff-conv-2',
    });

    expect(result.finalMessage).toBeDefined();
    expect(result.turns).toBeGreaterThanOrEqual(1);
  });
});
