import { describe, expect, mock, test } from 'bun:test';
import { ProviderError } from '../errors.ts';
import { aiSdkProvider } from './ai-sdk-provider.ts';
import type { StreamEvent } from './types.ts';

async function collectStream(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of iter) {
    events.push(e);
  }
  return events;
}

function makeMockModel(overrides: Record<string, unknown> = {}) {
  return {
    modelId: 'test-model',
    specificationVersion: 'v2',
    provider: 'test-provider',
    defaultObjectGenerationMode: 'json',
    supportsUrl: () => false,
    ...overrides,
  };
}

describe('aiSdkProvider', () => {
  test('id defaults to modelId', () => {
    const model = makeMockModel({ modelId: 'my-model' });
    const provider = aiSdkProvider(model as never);
    expect(provider.id).toBe('my-model');
  });

  test('id can be overridden via opts', () => {
    const model = makeMockModel({ modelId: 'my-model' });
    const provider = aiSdkProvider(model as never, { id: 'custom-id' });
    expect(provider.id).toBe('custom-id');
  });

  test('capabilities defaults to all false', () => {
    const model = makeMockModel();
    const provider = aiSdkProvider(model as never);
    expect(provider.capabilities).toEqual({
      caching: false,
      thinking: false,
      batch: false,
      structuredStream: false,
    });
  });

  test('capabilities can be partially overridden', () => {
    const model = makeMockModel();
    const provider = aiSdkProvider(model as never, {
      capabilities: { caching: true, thinking: true },
    });
    expect(provider.capabilities.caching).toBe(true);
    expect(provider.capabilities.thinking).toBe(true);
    expect(provider.capabilities.batch).toBe(false);
    expect(provider.capabilities.structuredStream).toBe(false);
  });

  test('generate() calls AI SDK generateText and maps result', async () => {
    const model = makeMockModel({
      doGenerate: mock(async () => ({
        content: [{ type: 'text', text: 'Hello world' }],
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        request: { body: {} },
      })),
    });

    const provider = aiSdkProvider(model as never);
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toBe('Hello world');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  test('stream() returns async iterable of StreamEvents', async () => {
    const model = makeMockModel({
      doStream: mock(async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 't1' });
            controller.enqueue({ type: 'text-delta', id: 't1', delta: 'Hi' });
            controller.enqueue({ type: 'text-delta', id: 't1', delta: ' there' });
            controller.enqueue({ type: 'text-end', id: 't1' });
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
            });
            controller.close();
          },
        }),
        request: { body: {} },
      })),
    });

    const provider = aiSdkProvider(model as never);
    const events = await collectStream(
      provider.stream({ messages: [{ role: 'user', content: 'hi' }] }),
    );

    const textDeltas = events.filter((e) => e.type === 'text-delta');
    expect(textDeltas).toHaveLength(2);
    expect((textDeltas[0] as { delta: string }).delta).toBe('Hi');
    expect((textDeltas[1] as { delta: string }).delta).toBe(' there');

    const finish = events.find((e) => e.type === 'finish');
    expect(finish).toBeDefined();
  });

  test('stream() maps tool-call events', async () => {
    const model = makeMockModel({
      doStream: mock(async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'tc1',
              toolName: 'readFile',
              args: '{"path": "/foo"}',
            });
            controller.enqueue({
              type: 'finish',
              finishReason: 'tool-calls',
              usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
            });
            controller.close();
          },
        }),
        request: { body: {} },
      })),
    });

    const provider = aiSdkProvider(model as never);
    const events = await collectStream(
      provider.stream({ messages: [{ role: 'user', content: 'read /foo' }] }),
    );

    const toolCall = events.find((e) => e.type === 'tool-call') as
      | { type: 'tool-call'; id: string; name: string; args: unknown }
      | undefined;
    expect(toolCall).toBeDefined();
    expect(toolCall?.id).toBe('tc1');
    expect(toolCall?.name).toBe('readFile');
  });

  test('stream() emits usage event', async () => {
    const model = makeMockModel({
      doStream: mock(async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            });
            controller.close();
          },
        }),
        request: { body: {} },
      })),
    });

    const provider = aiSdkProvider(model as never);
    const events = await collectStream(
      provider.stream({ messages: [{ role: 'user', content: 'hi' }] }),
    );

    const usageEvent = events.find((e) => e.type === 'usage') as
      | { type: 'usage'; tokens: { inputTokens: number; outputTokens: number } }
      | undefined;
    expect(usageEvent).toBeDefined();
    expect(usageEvent?.tokens.inputTokens).toBe(100);
    expect(usageEvent?.tokens.outputTokens).toBe(50);
  });

  test('maps API errors to ProviderError', async () => {
    const model = makeMockModel({
      doGenerate: mock(async () => {
        const err = new Error('Rate limited') as Error & {
          statusCode?: number;
          isRetryable?: boolean;
        };
        err.name = 'AI_APICallError';
        err.statusCode = 429;
        err.isRetryable = true;
        throw err;
      }),
    });

    const provider = aiSdkProvider(model as never);
    try {
      await provider.generate({ messages: [{ role: 'user', content: 'hi' }] });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      const pe = e as ProviderError;
      expect(pe.kind).toBe('rate_limit');
      expect(pe.status).toBe(429);
      expect(pe.retriable).toBe(true);
    }
  });

  test('maps 401 errors to auth kind', async () => {
    const model = makeMockModel({
      doGenerate: mock(async () => {
        const err = new Error('Unauthorized') as Error & {
          statusCode?: number;
          isRetryable?: boolean;
        };
        err.name = 'AI_APICallError';
        err.statusCode = 401;
        err.isRetryable = false;
        throw err;
      }),
    });

    const provider = aiSdkProvider(model as never);
    try {
      await provider.generate({ messages: [{ role: 'user', content: 'hi' }] });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).kind).toBe('auth');
    }
  });

  test('stream() maps reasoning-delta events', async () => {
    const model = makeMockModel({
      doStream: mock(async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'reasoning-start', id: 'r1' });
            controller.enqueue({ type: 'reasoning-delta', id: 'r1', delta: 'thinking...' });
            controller.enqueue({ type: 'reasoning-end', id: 'r1' });
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
            });
            controller.close();
          },
        }),
        request: { body: {} },
      })),
    });

    const provider = aiSdkProvider(model as never);
    const events = await collectStream(
      provider.stream({ messages: [{ role: 'user', content: 'think' }] }),
    );

    const thinking = events.find((e) => e.type === 'thinking-delta') as
      | { type: 'thinking-delta'; delta: string }
      | undefined;
    expect(thinking).toBeDefined();
    expect(thinking?.delta).toBe('thinking...');
  });

  test('generate() handles tool calls in content', async () => {
    const model = makeMockModel({
      doGenerate: mock(async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc1',
            toolName: 'readFile',
            args: { path: '/foo' },
            toolCallType: 'function',
          },
        ],
        finishReason: 'tool-calls',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        request: { body: {} },
      })),
    });

    const provider = aiSdkProvider(model as never);
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'read /foo' }],
    });

    expect(result.finishReason).toBe('tool-calls');
    expect(result.message.role).toBe('assistant');
  });
});
