import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '../provider/types.ts';
import type { ScriptedStream } from './fake-provider.ts';
import { fakeProvider } from './fake-provider.ts';

async function collectStream(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of iter) {
    events.push(e);
  }
  return events;
}

describe('fakeProvider', () => {
  test('has a stable id', () => {
    const p = fakeProvider([]);
    expect(p.id).toBe('fake');
  });

  test('reports no capabilities by default', () => {
    const p = fakeProvider([]);
    expect(p.capabilities).toEqual({
      caching: false,
      thinking: false,
      batch: false,
      structuredStream: false,
    });
  });

  test('custom capabilities', () => {
    const p = fakeProvider([], { capabilities: { caching: true } });
    expect(p.capabilities.caching).toBe(true);
    expect(p.capabilities.thinking).toBe(false);
  });

  test('replays a single scripted stream', async () => {
    const script: ScriptedStream[] = [
      {
        events: [
          { type: 'text-delta', delta: 'Hello' },
          { type: 'text-delta', delta: ' world' },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ];
    const p = fakeProvider(script);
    const events = await collectStream(p.stream({ messages: [] }));
    expect(events).toEqual(script[0]?.events);
  });

  test('replays multiple scripted responses in order', async () => {
    const script: ScriptedStream[] = [
      {
        events: [
          { type: 'text-delta', delta: 'first' },
          { type: 'finish', reason: 'stop' },
        ],
      },
      {
        events: [
          { type: 'text-delta', delta: 'second' },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ];
    const p = fakeProvider(script);

    const first = await collectStream(p.stream({ messages: [] }));
    expect(first[0]).toEqual({ type: 'text-delta', delta: 'first' });

    const second = await collectStream(p.stream({ messages: [] }));
    expect(second[0]).toEqual({ type: 'text-delta', delta: 'second' });
  });

  test('throws when script exhausted', async () => {
    const p = fakeProvider([{ events: [{ type: 'finish', reason: 'stop' }] }]);
    await collectStream(p.stream({ messages: [] }));
    expect(() => p.stream({ messages: [] })).toThrow(/script exhausted/i);
  });

  test('stream respects abort signal', async () => {
    const ac = new AbortController();
    const script: ScriptedStream[] = [
      {
        events: [
          { type: 'text-delta', delta: 'a' },
          { type: 'text-delta', delta: 'b' },
          { type: 'text-delta', delta: 'c' },
          { type: 'finish', reason: 'stop' },
        ],
        delayMs: 50,
      },
    ];
    const p = fakeProvider(script);

    const events: StreamEvent[] = [];
    setTimeout(() => ac.abort(), 30);
    try {
      for await (const e of p.stream({ messages: [] }, ac.signal)) {
        events.push(e);
      }
    } catch {
      // abort expected
    }
    expect(events.length).toBeLessThan(4);
  });

  test('generate() assembles text from stream', async () => {
    const script: ScriptedStream[] = [
      {
        events: [
          { type: 'text-delta', delta: 'Hello' },
          { type: 'text-delta', delta: ' world' },
          {
            type: 'usage',
            tokens: {
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
            },
          },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ];
    const p = fakeProvider(script);
    const result = await p.generate({ messages: [] });
    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toBe('Hello world');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  test('generate() collects tool calls', async () => {
    const script: ScriptedStream[] = [
      {
        events: [
          { type: 'tool-call', id: 'tc1', name: 'readFile', args: { path: '/foo' } },
          {
            type: 'usage',
            tokens: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
          },
          { type: 'finish', reason: 'tool-calls' },
        ],
      },
    ];
    const p = fakeProvider(script);
    const result = await p.generate({ messages: [] });
    expect(result.finishReason).toBe('tool-calls');
    const content = result.message.content;
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'tool-call')).toBe(true);
  });

  test('stream with delay introduces actual delays', async () => {
    const script: ScriptedStream[] = [
      {
        events: [
          { type: 'text-delta', delta: 'a' },
          { type: 'finish', reason: 'stop' },
        ],
        delayMs: 30,
      },
    ];
    const p = fakeProvider(script);
    const start = Date.now();
    await collectStream(p.stream({ messages: [] }));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });
});
