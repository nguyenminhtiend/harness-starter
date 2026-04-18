import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { createAgent } from '../create-agent.ts';
import type { AgentEvent } from '../types.ts';
import { createHandoffAgent, handoff } from './handoff.ts';

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

describe('handoff', () => {
  test('handoff transfers control from agent A to agent B', async () => {
    const agentBProvider = fakeProvider([{ events: textScript('Agent B here!') }]);
    const agentB = createAgent({ provider: agentBProvider, systemPrompt: 'I am B' });

    const handoffTool = handoff(agentB);

    const agentAProvider = fakeProvider([
      { events: toolCallScript('tc1', handoffTool.name, { reason: 'needs specialist' }) },
    ]);
    const agentA = createAgent({
      provider: agentAProvider,
      tools: [handoffTool],
      systemPrompt: 'I am A',
    });

    const orchestrator = createHandoffAgent(agentA);
    const result = await orchestrator.run({ userMessage: 'Help me' });

    expect(result.finalMessage).toBe('Agent B here!');
  });

  test('handoff emits handoff event on stream', async () => {
    const agentBProvider = fakeProvider([{ events: textScript('B response') }]);
    const agentB = createAgent({ provider: agentBProvider });

    const handoffTool = handoff(agentB);

    const agentAProvider = fakeProvider([
      { events: toolCallScript('tc1', handoffTool.name, { reason: 'transfer' }) },
    ]);
    const agentA = createAgent({ provider: agentAProvider, tools: [handoffTool] });

    const orchestrator = createHandoffAgent(agentA);
    const events: AgentEvent[] = [];
    for await (const ev of orchestrator.stream({ userMessage: 'test' })) {
      events.push(ev);
    }

    const handoffEvent = events.find((e) => e.type === 'handoff');
    expect(handoffEvent).toBeDefined();
  });

  test('A -> B -> A round-trip works', async () => {
    // Agent C handles the final response
    const agentCProvider = fakeProvider([{ events: textScript('Final answer from A') }]);
    const agentC = createAgent({ provider: agentCProvider });

    const handoffBackTool = handoff(agentC);

    const agentBProvider = fakeProvider([
      { events: toolCallScript('tc1', handoffBackTool.name, { reason: 'back to A' }) },
    ]);
    const agentB = createAgent({ provider: agentBProvider, tools: [handoffBackTool] });

    const handoffToBTool = handoff(agentB);
    const agentAProvider = fakeProvider([
      { events: toolCallScript('tc1', handoffToBTool.name, { reason: 'to B' }) },
    ]);
    const agentA = createAgent({ provider: agentAProvider, tools: [handoffToBTool] });

    const orchestrator = createHandoffAgent(agentA);
    const result = await orchestrator.run({ userMessage: 'test' });

    expect(result.finalMessage).toBe('Final answer from A');
  });
});
