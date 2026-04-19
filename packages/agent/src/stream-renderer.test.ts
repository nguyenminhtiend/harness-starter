import { describe, expect, mock, test } from 'bun:test';
import type { FinishReason, StreamEvent, Usage } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { z } from 'zod';
import { createAgent } from './create-agent.ts';
import { createStreamRenderer } from './stream-renderer.ts';
import { tool } from './tool.ts';
import type { AgentEvent } from './types.ts';

async function* iterableFrom(events: AgentEvent[]): AsyncIterable<AgentEvent> {
  for (const ev of events) {
    yield ev;
  }
}

const USAGE: Usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

describe('createStreamRenderer', () => {
  test('accumulates text from text-delta events', async () => {
    const renderer = createStreamRenderer({});
    const stream = iterableFrom([
      { type: 'text-delta', delta: 'Hello' },
      { type: 'text-delta', delta: ' world' },
      { type: 'usage', tokens: USAGE },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    const summary = await renderer.render(stream);
    expect(summary.text).toBe('Hello world');
  });

  test('counts turns from turn-start events', async () => {
    const renderer = createStreamRenderer({});
    const stream = iterableFrom([
      { type: 'turn-start', turn: 1 },
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', tokens: USAGE },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    const summary = await renderer.render(stream);
    expect(summary.turns).toBe(1);
  });

  test('accumulates usage across multiple usage events', async () => {
    const renderer = createStreamRenderer({});
    const usage1: Usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const usage2: Usage = { inputTokens: 20, outputTokens: 10, totalTokens: 30 };
    const stream = iterableFrom([
      { type: 'turn-start', turn: 1 },
      { type: 'usage', tokens: usage1 },
      { type: 'finish', reason: 'tool-calls' as FinishReason },
      { type: 'turn-start', turn: 2 },
      { type: 'usage', tokens: usage2 },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    const summary = await renderer.render(stream);
    expect(summary.usage.inputTokens).toBe(30);
    expect(summary.usage.outputTokens).toBe(15);
    expect(summary.usage.totalTokens).toBe(45);
  });

  test('tracks positive durationMs', async () => {
    const renderer = createStreamRenderer({});
    const stream = iterableFrom([
      { type: 'text-delta', delta: 'x' },
      { type: 'usage', tokens: USAGE },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    const summary = await renderer.render(stream);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('calls onTextDelta callback for each text-delta', async () => {
    const onTextDelta = mock(() => {});
    const renderer = createStreamRenderer({ onTextDelta });
    const stream = iterableFrom([
      { type: 'text-delta', delta: 'A' },
      { type: 'text-delta', delta: 'B' },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onTextDelta).toHaveBeenCalledTimes(2);
    expect(onTextDelta.mock.calls[0]).toEqual(['A']);
    expect(onTextDelta.mock.calls[1]).toEqual(['B']);
  });

  test('calls onThinkingDelta for thinking-delta events', async () => {
    const onThinkingDelta = mock(() => {});
    const renderer = createStreamRenderer({ onThinkingDelta });
    const stream = iterableFrom([
      { type: 'thinking-delta', delta: 'hmm' },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onThinkingDelta).toHaveBeenCalledWith('hmm');
  });

  test('calls onToolStart for tool-start events', async () => {
    const onToolStart = mock(() => {});
    const renderer = createStreamRenderer({ onToolStart });
    const stream = iterableFrom([
      { type: 'tool-start', id: 't1', name: 'echo', args: { text: 'hi' } },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onToolStart).toHaveBeenCalledWith('t1', 'echo', { text: 'hi' });
  });

  test('calls onToolResult for tool-result events', async () => {
    const onToolResult = mock(() => {});
    const renderer = createStreamRenderer({ onToolResult });
    const stream = iterableFrom([
      { type: 'tool-result', id: 't1', result: 'done', durationMs: 42 },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onToolResult).toHaveBeenCalledWith('t1', 'done', 42);
  });

  test('calls onToolError for tool-error events', async () => {
    const onToolError = mock(() => {});
    const renderer = createStreamRenderer({ onToolError });
    const err = { name: 'ToolError', message: 'boom', code: 'TOOL_ERROR' } as never;
    const stream = iterableFrom([
      { type: 'tool-error', id: 't1', error: err },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onToolError).toHaveBeenCalledWith('t1', err);
  });

  test('calls onUsage for each usage event', async () => {
    const onUsage = mock(() => {});
    const renderer = createStreamRenderer({ onUsage });
    const stream = iterableFrom([
      { type: 'usage', tokens: USAGE },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onUsage).toHaveBeenCalledWith(USAGE);
  });

  test('calls onFinish for finish events', async () => {
    const onFinish = mock(() => {});
    const renderer = createStreamRenderer({ onFinish });
    const stream = iterableFrom([{ type: 'finish', reason: 'stop' as FinishReason }]);

    await renderer.render(stream);
    expect(onFinish).toHaveBeenCalledWith('stop');
  });

  test('calls onTurnStart for turn-start events', async () => {
    const onTurnStart = mock(() => {});
    const renderer = createStreamRenderer({ onTurnStart });
    const stream = iterableFrom([
      { type: 'turn-start', turn: 1 },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onTurnStart).toHaveBeenCalledWith(1);
  });

  test('calls onBudgetExceeded for budget.exceeded events', async () => {
    const onBudgetExceeded = mock(() => {});
    const renderer = createStreamRenderer({ onBudgetExceeded });
    const stream = iterableFrom([
      { type: 'budget.exceeded', kind: 'tokens' as const, spent: 100, limit: 50 },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    await renderer.render(stream);
    expect(onBudgetExceeded).toHaveBeenCalledWith('tokens', 100, 50);
  });

  test('calls onAbort for abort events', async () => {
    const onAbort = mock(() => {});
    const renderer = createStreamRenderer({ onAbort });
    const stream = iterableFrom([{ type: 'abort', reason: 'user cancelled' }]);

    await renderer.render(stream);
    expect(onAbort).toHaveBeenCalledWith('user cancelled');
  });

  test('calls onError when stream iteration throws', async () => {
    const onError = mock(() => {});
    const renderer = createStreamRenderer({ onError });

    async function* failingStream(): AsyncIterable<AgentEvent> {
      yield { type: 'text-delta', delta: 'hi' };
      throw new Error('stream broke');
    }

    const summary = await renderer.render(failingStream());
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('stream broke');
    expect(summary.text).toBe('hi');
  });

  test('omitted callbacks are silently skipped', async () => {
    const renderer = createStreamRenderer({});
    const stream = iterableFrom([
      { type: 'turn-start', turn: 1 },
      { type: 'text-delta', delta: 'hi' },
      { type: 'thinking-delta', delta: 'hmm' },
      { type: 'tool-start', id: 't1', name: 'echo', args: {} },
      { type: 'tool-result', id: 't1', result: 'ok', durationMs: 5 },
      { type: 'usage', tokens: USAGE },
      { type: 'finish', reason: 'stop' as FinishReason },
    ]);

    const summary = await renderer.render(stream);
    expect(summary.text).toBe('hi');
    expect(summary.turns).toBe(1);
  });

  test('returns zero-valued summary for empty stream', async () => {
    const renderer = createStreamRenderer({});
    const stream = iterableFrom([]);

    const summary = await renderer.render(stream);
    expect(summary.text).toBe('');
    expect(summary.turns).toBe(0);
    expect(summary.usage.totalTokens).toBe(0);
  });
});

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

describe('createStreamRenderer + fakeProvider integration', () => {
  test('receives events in correct order for a tool-calling agent', async () => {
    const echoTool = tool({
      name: 'echo',
      description: 'Echoes input',
      parameters: z.object({ text: z.string() }),
      execute: async (args) => `Echo: ${args.text}`,
    });

    const provider = fakeProvider([
      { events: toolCallScript('tc1', 'echo', { text: 'hello' }) },
      { events: textScript('Done.') },
    ]);

    const agent = createAgent({ provider, tools: [echoTool] });

    const eventTypes: string[] = [];
    const renderer = createStreamRenderer({
      onTurnStart: () => eventTypes.push('turn-start'),
      onToolStart: () => eventTypes.push('tool-start'),
      onToolResult: () => eventTypes.push('tool-result'),
      onTextDelta: () => eventTypes.push('text-delta'),
      onUsage: () => eventTypes.push('usage'),
      onFinish: () => eventTypes.push('finish'),
    });

    const summary = await renderer.render(agent.stream({ userMessage: 'Echo hello' }));

    expect(summary.text).toBe('Done.');
    expect(summary.turns).toBe(2);
    expect(summary.usage.totalTokens).toBe(30);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);

    expect(eventTypes[0]).toBe('turn-start');
    expect(eventTypes).toContain('tool-start');
    expect(eventTypes).toContain('tool-result');
    expect(eventTypes).toContain('text-delta');
    expect(eventTypes).toContain('usage');
    expect(eventTypes).toContain('finish');

    const toolStartIdx = eventTypes.indexOf('tool-start');
    const toolResultIdx = eventTypes.indexOf('tool-result');
    expect(toolStartIdx).toBeLessThan(toolResultIdx);
  });

  test('handles simple text response without tools', async () => {
    const provider = fakeProvider([{ events: textScript('Hello!') }]);
    const agent = createAgent({ provider });

    const renderer = createStreamRenderer({});
    const summary = await renderer.render(agent.stream({ userMessage: 'Hi' }));

    expect(summary.text).toBe('Hello!');
    expect(summary.turns).toBe(1);
    expect(summary.usage.inputTokens).toBe(10);
    expect(summary.usage.outputTokens).toBe(5);
  });
});
