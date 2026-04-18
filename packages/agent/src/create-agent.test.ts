import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { createEventBus, LoopExhaustedError } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { z } from 'zod';
import { createAgent } from './create-agent.ts';
import { inMemoryStore } from './memory/store.ts';
import { tool } from './tool.ts';
import type { AgentEvent } from './types.ts';

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

describe('createAgent', () => {
  test('simple text response via run()', async () => {
    const provider = fakeProvider([{ events: textScript('Hello!') }]);
    const agent = createAgent({ provider });
    const result = await agent.run({ userMessage: 'Hi' });
    expect(result.finalMessage).toBe('Hello!');
    expect(result.turns).toBe(1);
  });

  test('streams AgentEvents', async () => {
    const provider = fakeProvider([{ events: textScript('Hi') }]);
    const agent = createAgent({ provider });

    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'Hi' })) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('turn-start');
    expect(types).toContain('text-delta');
    expect(types).toContain('usage');
    expect(types).toContain('finish');
  });

  test('tool calling round-trip', async () => {
    const echoTool = tool({
      name: 'echo',
      description: 'Echoes input',
      parameters: z.object({ text: z.string() }),
      execute: async (args) => `Echo: ${args.text}`,
    });

    const provider = fakeProvider([
      { events: toolCallScript('tc1', 'echo', { text: 'hello' }) },
      { events: textScript('Done echoing.') },
    ]);

    const agent = createAgent({ provider, tools: [echoTool] });
    const result = await agent.run({ userMessage: 'Echo hello' });
    expect(result.finalMessage).toBe('Done echoing.');
    expect(result.turns).toBe(2);
  });

  test('tool error becomes isError tool-result', async () => {
    const failTool = tool({
      name: 'fail',
      description: 'Always fails',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('boom');
      },
    });

    const provider = fakeProvider([
      { events: toolCallScript('tc1', 'fail', {}) },
      { events: textScript('Tool failed, sorry.') },
    ]);

    const agent = createAgent({ provider, tools: [failTool] });

    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'Do it' })) {
      events.push(ev);
    }

    const toolError = events.find((e) => e.type === 'tool-error');
    expect(toolError).toBeDefined();
  });

  test('invalid tool args emit validation error', async () => {
    const strictTool = tool({
      name: 'strict',
      description: 'Needs a number',
      parameters: z.object({ n: z.number() }),
      execute: async (args) => args.n * 2,
    });

    const provider = fakeProvider([
      { events: toolCallScript('tc1', 'strict', { n: 'not-a-number' }) },
      { events: textScript('OK, moving on.') },
    ]);

    const agent = createAgent({ provider, tools: [strictTool] });

    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'compute' })) {
      events.push(ev);
    }

    const toolError = events.find((e) => e.type === 'tool-error');
    expect(toolError).toBeDefined();
  });

  test('unknown tool produces tool-error', async () => {
    const provider = fakeProvider([
      { events: toolCallScript('tc1', 'nonexistent', {}) },
      { events: textScript('Oh well.') },
    ]);

    const agent = createAgent({ provider, tools: [] });

    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'call it' })) {
      events.push(ev);
    }

    const toolError = events.find((e) => e.type === 'tool-error');
    expect(toolError).toBeDefined();
  });

  test('maxTurns exceeded throws LoopExhaustedError', async () => {
    const loopTool = tool({
      name: 'loop',
      description: 'loops',
      parameters: z.object({}),
      execute: async () => 'again',
    });

    const provider = fakeProvider([
      { events: toolCallScript('tc1', 'loop', {}) },
      { events: toolCallScript('tc2', 'loop', {}) },
      { events: toolCallScript('tc3', 'loop', {}) },
    ]);

    const agent = createAgent({ provider, tools: [loopTool], maxTurns: 2 });

    await expect(agent.run({ userMessage: 'go' })).rejects.toThrow(LoopExhaustedError);
  });

  test('AbortSignal cancels the loop', async () => {
    const provider = fakeProvider([{ events: textScript('Hello!'), delayMs: 100 }]);

    const ac = new AbortController();
    const agent = createAgent({ provider });

    setTimeout(() => ac.abort(), 10);

    await expect(agent.run({ userMessage: 'Hi' }, { signal: ac.signal })).rejects.toThrow();
  });

  test('inMemoryStore persists messages across runs', async () => {
    const memory = inMemoryStore();
    const convId = 'test-conv';

    const provider = fakeProvider([
      { events: textScript('First response') },
      { events: textScript('Second response') },
    ]);

    const agent = createAgent({ provider, memory });

    await agent.run({ conversationId: convId, userMessage: 'First' });
    const afterFirst = await memory.load(convId);
    expect(afterFirst.length).toBeGreaterThan(0);

    await agent.run({ conversationId: convId, userMessage: 'Second' });
    const afterSecond = await memory.load(convId);
    expect(afterSecond.length).toBeGreaterThan(afterFirst.length);
  });

  test('event bus receives run lifecycle events', async () => {
    const bus = createEventBus();
    const received: string[] = [];

    bus.on('run.start', () => received.push('run.start'));
    bus.on('run.finish', () => received.push('run.finish'));
    bus.on('turn.start', () => received.push('turn.start'));
    bus.on('turn.finish', () => received.push('turn.finish'));
    bus.on('provider.call', () => received.push('provider.call'));
    bus.on('provider.usage', () => received.push('provider.usage'));

    const provider = fakeProvider([{ events: textScript('Hi') }]);
    const agent = createAgent({ provider, events: bus });
    await agent.run({ userMessage: 'Hi' });

    expect(received).toContain('run.start');
    expect(received).toContain('run.finish');
    expect(received).toContain('turn.start');
    expect(received).toContain('turn.finish');
    expect(received).toContain('provider.call');
    expect(received).toContain('provider.usage');
  });

  test('system prompt prepended to messages', async () => {
    const calls: unknown[] = [];
    const provider = fakeProvider([{ events: textScript('OK') }]);
    const origStream = provider.stream.bind(provider);
    (provider as { stream: typeof provider.stream }).stream = (req, signal) => {
      calls.push(req.messages);
      return origStream(req, signal);
    };

    const agent = createAgent({
      provider,
      systemPrompt: 'You are helpful.',
    });
    await agent.run({ userMessage: 'Hi' });

    const msgs = calls[0] as { role: string; content: string }[];
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toBe('You are helpful.');
  });
});
