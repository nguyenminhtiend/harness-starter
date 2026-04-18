import { beforeEach, describe, expect, test } from 'bun:test';
import type { EventBus, GenerateRequest, Usage } from '@harness/core';
import { createEventBus, ToolError } from '@harness/core';
import {
  type LangfuseClient,
  type LangfuseGeneration,
  type LangfuseSpan,
  type LangfuseTrace,
  langfuseAdapter,
} from './langfuse-adapter.ts';

function createFakeClient() {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];

  function record(method: string, args: Record<string, unknown>) {
    calls.push({ method, args });
  }

  function makeSpan(traceId: string, spanKey: string): LangfuseSpan {
    return {
      update(data: Record<string, unknown>) {
        record('span.update', { traceId, spanKey, ...data });
      },
      end(data?: Record<string, unknown>) {
        record('span.end', { traceId, spanKey, ...(data ?? {}) });
      },
    };
  }

  function makeGeneration(traceId: string, genKey: string): LangfuseGeneration {
    return {
      update(data: Record<string, unknown>) {
        record('generation.update', { traceId, genKey, ...data });
      },
      end(data?: Record<string, unknown>) {
        record('generation.end', { traceId, genKey, ...(data ?? {}) });
      },
    };
  }

  function makeTrace(traceId: string): LangfuseTrace {
    let spanIdx = 0;
    let genIdx = 0;
    return {
      span(data: Record<string, unknown>) {
        const spanKey = `s${spanIdx}`;
        spanIdx += 1;
        record('trace.span', { traceId, spanKey, ...data });
        return makeSpan(traceId, spanKey);
      },
      generation(data: Record<string, unknown>) {
        const genKey = `g${genIdx}`;
        genIdx += 1;
        record('trace.generation', { traceId, genKey, ...data });
        return makeGeneration(traceId, genKey);
      },
      update(data: Record<string, unknown>) {
        record('trace.update', { traceId, ...data });
      },
    };
  }

  const client: LangfuseClient = {
    trace(data: Record<string, unknown>) {
      record('client.trace', { ...data });
      const id = String(data.id ?? '');
      return makeTrace(id);
    },
  };

  return { client, calls };
}

const emptyRequest: GenerateRequest = { messages: [] };

const sampleUsage: Usage = {
  inputTokens: 1,
  outputTokens: 2,
  totalTokens: 3,
};

describe('langfuseAdapter', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  test('creates a trace on run.start with runId and conversationId', () => {
    const { client, calls } = createFakeClient();
    langfuseAdapter(bus, client);

    bus.emit('run.start', {
      runId: 'run-1',
      conversationId: 'conv-1',
      input: { userMessage: 'hi' },
    });

    expect(calls[0]).toEqual({
      method: 'client.trace',
      args: {
        id: 'run-1',
        name: 'harness.run',
        sessionId: 'conv-1',
        input: { userMessage: 'hi' },
      },
    });
  });

  test('updates trace on run.finish with result', () => {
    const { client, calls } = createFakeClient();
    langfuseAdapter(bus, client);

    bus.emit('run.start', {
      runId: 'run-1',
      conversationId: 'conv-1',
      input: {},
    });
    const result = { turns: 2, finalMessage: 'done' };
    bus.emit('run.finish', { runId: 'run-1', result });

    expect(calls[1]).toEqual({
      method: 'trace.update',
      args: {
        traceId: 'run-1',
        output: result,
      },
    });
  });

  test('creates a span on turn.start and ends on turn.finish', () => {
    const { client, calls } = createFakeClient();
    langfuseAdapter(bus, client);

    bus.emit('run.start', {
      runId: 'run-1',
      conversationId: 'conv-1',
      input: {},
    });
    bus.emit('turn.start', { runId: 'run-1', turn: 2 });
    bus.emit('turn.finish', { runId: 'run-1', turn: 2, usage: sampleUsage });

    expect(calls[1]).toEqual({
      method: 'trace.span',
      args: {
        traceId: 'run-1',
        spanKey: 's0',
        name: 'turn',
        metadata: { turn: 2 },
      },
    });
    expect(calls[2]).toEqual({
      method: 'span.end',
      args: {
        traceId: 'run-1',
        spanKey: 's0',
        metadata: { usage: sampleUsage },
      },
    });
  });

  test('creates a generation on provider.call and ends on provider.usage with tokens', () => {
    const { client, calls } = createFakeClient();
    langfuseAdapter(bus, client);

    bus.emit('run.start', {
      runId: 'run-1',
      conversationId: 'conv-1',
      input: {},
    });
    bus.emit('provider.call', {
      runId: 'run-1',
      providerId: 'openai',
      request: emptyRequest,
    });
    bus.emit('provider.usage', {
      runId: 'run-1',
      tokens: sampleUsage,
      costUSD: 0.01,
      cache: { read: 0, write: 1 },
    });

    expect(calls[1]).toEqual({
      method: 'trace.generation',
      args: {
        traceId: 'run-1',
        genKey: 'g0',
        name: 'openai',
        input: emptyRequest,
      },
    });
    expect(calls[2]).toEqual({
      method: 'generation.end',
      args: {
        traceId: 'run-1',
        genKey: 'g0',
        usage: {
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
        },
        metadata: {
          costUSD: 0.01,
          cache: { read: 0, write: 1 },
        },
      },
    });
  });

  test('creates a span on tool.start and ends on tool.finish', () => {
    const { client, calls } = createFakeClient();
    langfuseAdapter(bus, client);

    bus.emit('run.start', {
      runId: 'run-1',
      conversationId: 'conv-1',
      input: {},
    });
    bus.emit('tool.start', { runId: 'run-1', toolName: 'read', args: { path: '/a' } });
    bus.emit('tool.finish', {
      runId: 'run-1',
      toolName: 'read',
      result: 'content',
      durationMs: 10,
    });

    expect(calls[1]).toEqual({
      method: 'trace.span',
      args: {
        traceId: 'run-1',
        spanKey: 's0',
        name: 'read',
        input: { path: '/a' },
      },
    });
    expect(calls[2]).toEqual({
      method: 'span.end',
      args: {
        traceId: 'run-1',
        spanKey: 's0',
        output: 'content',
        metadata: { durationMs: 10 },
      },
    });
  });

  test('ends tool span with error on tool.error', () => {
    const { client, calls } = createFakeClient();
    langfuseAdapter(bus, client);

    bus.emit('run.start', {
      runId: 'run-1',
      conversationId: 'conv-1',
      input: {},
    });
    bus.emit('tool.start', { runId: 'run-1', toolName: 'read', args: {} });
    const err = new ToolError('failed', { toolName: 'read' });
    bus.emit('tool.error', { runId: 'run-1', toolName: 'read', error: err });

    expect(calls[1]).toEqual({
      method: 'trace.span',
      args: {
        traceId: 'run-1',
        spanKey: 's0',
        name: 'read',
        input: {},
      },
    });
    expect(calls[2]?.method).toBe('span.end');
    expect(calls[2]?.args.traceId).toBe('run-1');
    expect(calls[2]?.args.spanKey).toBe('s0');
    expect((calls[2]?.args.metadata as { error: unknown }).error).toEqual(err.toJSON());
  });

  test('unsubscribe stops all Langfuse calls', () => {
    const { client, calls } = createFakeClient();
    const unsub = langfuseAdapter(bus, client);

    bus.emit('run.start', {
      runId: 'run-1',
      conversationId: 'conv-1',
      input: {},
    });
    expect(calls).toHaveLength(1);

    unsub();
    bus.emit('run.start', {
      runId: 'run-2',
      conversationId: 'conv-2',
      input: {},
    });
    bus.emit('run.finish', { runId: 'run-2', result: {} });

    expect(calls).toHaveLength(1);
  });
});
