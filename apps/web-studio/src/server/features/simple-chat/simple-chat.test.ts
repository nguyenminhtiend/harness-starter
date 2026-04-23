import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from '@harness/agent';
import { inMemoryCheckpointer, inMemoryStore } from '@harness/agent';
import type { StreamEvent } from '@harness/core';
import { createEventBus } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { simpleChatToolDef } from './index.ts';

function toolCallScript(id: string, name: string, args: unknown): StreamEvent[] {
  return [
    { type: 'tool-call', id, name, args },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'tool-calls' },
  ];
}

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'stop' },
  ];
}

describe('simpleChatToolDef', () => {
  test('has correct metadata', () => {
    expect(simpleChatToolDef.id).toBe('simple-chat');
    expect(simpleChatToolDef.title).toBeDefined();
    expect(simpleChatToolDef.settingsSchema).toBeDefined();
  });

  test('defaultSettings parses cleanly', () => {
    const defaults = simpleChatToolDef.defaultSettings;
    expect(defaults.maxTurns).toBe(5);
    expect(defaults.systemPrompt).toBeDefined();
  });

  test('agent calls calculator tool and returns final text', async () => {
    const provider = fakeProvider([
      { events: toolCallScript('call-1', 'calculator', { expression: '2 + 3' }) },
      { events: textScript('The result is 5.') },
    ]);
    const bus = createEventBus();
    const toolEvents: string[] = [];
    bus.on('tool.start', (ev) => toolEvents.push(`start:${ev.toolName}`));
    bus.on('tool.finish', (ev) => toolEvents.push(`finish:${ev.toolName}`));

    const agent = simpleChatToolDef.buildAgent({
      provider,
      settings: simpleChatToolDef.defaultSettings,
      store: inMemoryStore(),
      checkpointer: inMemoryCheckpointer(),
      bus,
      signal: new AbortController().signal,
    });

    const result = await agent.run({ userMessage: 'What is 2 + 3?' });
    expect(result.finalMessage).toBe('The result is 5.');
    expect(toolEvents).toContain('start:calculator');
    expect(toolEvents).toContain('finish:calculator');
  });

  test('agent calls get_time tool and returns final text', async () => {
    const provider = fakeProvider([
      { events: toolCallScript('call-1', 'get_time', { timezone: 'UTC' }) },
      { events: textScript('The current UTC time is now.') },
    ]);
    const bus = createEventBus();
    const toolEvents: string[] = [];
    bus.on('tool.start', (ev) => toolEvents.push(`start:${ev.toolName}`));
    bus.on('tool.finish', (ev) => toolEvents.push(`finish:${ev.toolName}`));

    const agent = simpleChatToolDef.buildAgent({
      provider,
      settings: simpleChatToolDef.defaultSettings,
      store: inMemoryStore(),
      checkpointer: inMemoryCheckpointer(),
      bus,
      signal: new AbortController().signal,
    });

    const result = await agent.run({ userMessage: 'What time is it?' });
    expect(result.finalMessage).toBe('The current UTC time is now.');
    expect(toolEvents).toContain('start:get_time');
    expect(toolEvents).toContain('finish:get_time');
  });

  test('stream emits tool-start and tool-result events', async () => {
    const provider = fakeProvider([
      { events: toolCallScript('call-1', 'calculator', { expression: '10 * 5' }) },
      { events: textScript('50') },
    ]);
    const bus = createEventBus();

    const agent = simpleChatToolDef.buildAgent({
      provider,
      settings: simpleChatToolDef.defaultSettings,
      store: inMemoryStore(),
      checkpointer: inMemoryCheckpointer(),
      bus,
      signal: new AbortController().signal,
    });

    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: '10 * 5' })) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain('tool-start');
    expect(types).toContain('tool-result');
  });
});
