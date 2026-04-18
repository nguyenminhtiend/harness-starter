import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { createAgent } from '../create-agent.ts';
import { subagentAsTool } from './subagent.ts';

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'stop' },
  ];
}

function toolCallScript(id: string, name: string, args: unknown): StreamEvent[] {
  return [
    { type: 'tool-call', id, name, args },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'tool-calls' },
  ];
}

describe('subagentAsTool', () => {
  test('parent delegates to child agent', async () => {
    const childProvider = fakeProvider([{ events: textScript('Child says: 42') }]);
    const child = createAgent({ provider: childProvider, systemPrompt: 'Calculator' });

    const parentProvider = fakeProvider([
      { events: toolCallScript('tc1', 'calculator', { input: 'What is 6*7?' }) },
      { events: textScript('The answer is 42.') },
    ]);

    const calcTool = subagentAsTool(child, {
      name: 'calculator',
      description: 'Solves math problems',
    });

    const parent = createAgent({ provider: parentProvider, tools: [calcTool] });
    const result = await parent.run({ userMessage: 'What is 6*7?' });

    expect(result.finalMessage).toBe('The answer is 42.');
    expect(result.turns).toBe(2);
  });

  test('child gets fresh conversationId', async () => {
    let childConvId: string | undefined;
    const childProvider = fakeProvider([{ events: textScript('done') }]);
    const child = createAgent({ provider: childProvider });

    // Intercept child.run to capture conversationId
    const origRun = child.run.bind(child);
    child.run = async (input, opts) => {
      childConvId = input.conversationId;
      return origRun(input, opts);
    };

    const tool = subagentAsTool(child, { name: 'sub', description: 'sub' });
    await tool.execute(
      { input: 'test' },
      { runId: 'r1', conversationId: 'parent-conv', signal: new AbortController().signal },
    );

    expect(childConvId).toBeDefined();
    expect(childConvId).not.toBe('parent-conv');
  });

  test('child inherits parent AbortSignal', async () => {
    const ac = new AbortController();
    const childProvider = fakeProvider([{ events: textScript('done'), delayMs: 200 }]);
    const child = createAgent({ provider: childProvider });

    const tool = subagentAsTool(child, { name: 'sub', description: 'sub' });

    setTimeout(() => ac.abort(), 10);

    await expect(
      tool.execute({ input: 'test' }, { runId: 'r1', conversationId: 'c1', signal: ac.signal }),
    ).rejects.toThrow();
  });
});
