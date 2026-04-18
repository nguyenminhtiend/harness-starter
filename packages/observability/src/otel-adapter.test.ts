import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { EventBus } from '@harness/core';
import { createEventBus, ProviderError } from '@harness/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { otelAdapter } from './otel-adapter.ts';

let bus: EventBus;
let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  bus = createEventBus();
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
});

afterEach(() => {
  exporter.reset();
  provider.shutdown();
});

function getTracer() {
  return provider.getTracer('test');
}

function byName(spans: ReadableSpan[], name: string) {
  return spans.find((s) => s.name === name);
}

describe('otelAdapter', () => {
  test('creates a root span on run.start and ends it on run.finish', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('run.finish', { runId: 'r1', result: { turns: 1 } });

    unsub();

    const spans = exporter.getFinishedSpans();
    const run = byName(spans, 'harness.run');
    expect(run).toBeDefined();
    expect(run?.attributes.runId).toBe('r1');
    expect(run?.attributes.conversationId).toBe('c1');
    expect(run?.status.code).toBe(1);
    expect(run?.ended).toBe(true);
  });

  test('creates turn child span under run span on turn.start, ends on turn.finish with usage attrs', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('turn.start', { runId: 'r1', turn: 1 });
    bus.emit('turn.finish', {
      runId: 'r1',
      turn: 1,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    bus.emit('run.finish', { runId: 'r1', result: {} });

    unsub();

    const spans = exporter.getFinishedSpans();
    const run = byName(spans, 'harness.run');
    const turn = byName(spans, 'harness.turn');
    expect(run).toBeDefined();
    expect(turn).toBeDefined();
    expect(turn?.attributes.turn).toBe(1);
    expect(turn?.attributes.inputTokens).toBe(10);
    expect(turn?.attributes.outputTokens).toBe(20);
    expect(turn?.attributes.totalTokens).toBe(30);
    expect(turn?.parentSpanId).toBe(run?.spanContext().spanId);
  });

  test('creates tool child span under turn span on tool.start, ends on tool.finish', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('turn.start', { runId: 'r1', turn: 1 });
    bus.emit('tool.start', { runId: 'r1', toolName: 'fs', args: {} });
    bus.emit('tool.finish', {
      runId: 'r1',
      toolName: 'fs',
      result: 'ok',
      durationMs: 42,
    });
    bus.emit('turn.finish', {
      runId: 'r1',
      turn: 1,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    bus.emit('run.finish', { runId: 'r1', result: {} });

    unsub();

    const spans = exporter.getFinishedSpans();
    const turn = byName(spans, 'harness.turn');
    const tool = byName(spans, 'harness.tool');
    expect(tool).toBeDefined();
    expect(tool?.attributes.toolName).toBe('fs');
    expect(tool?.attributes.durationMs).toBe(42);
    expect(tool?.parentSpanId).toBe(turn?.spanContext().spanId);
  });

  test('creates provider child span under turn span on provider.call, ends on provider.usage', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('turn.start', { runId: 'r1', turn: 1 });
    bus.emit('provider.call', {
      runId: 'r1',
      providerId: 'openai',
      request: { messages: [] },
    });
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
      costUSD: 0.01,
      cache: { read: 1, write: 2 },
    });
    bus.emit('turn.finish', {
      runId: 'r1',
      turn: 1,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    bus.emit('run.finish', { runId: 'r1', result: {} });

    unsub();

    const spans = exporter.getFinishedSpans();
    const turn = byName(spans, 'harness.turn');
    const prov = byName(spans, 'harness.provider');
    expect(prov).toBeDefined();
    expect(prov?.attributes.providerId).toBe('openai');
    expect(prov?.attributes.inputTokens).toBe(5);
    expect(prov?.attributes.outputTokens).toBe(7);
    expect(prov?.attributes.totalTokens).toBe(12);
    expect(prov?.attributes.costUSD).toBe(0.01);
    expect(prov?.attributes['cache.read']).toBe(1);
    expect(prov?.attributes['cache.write']).toBe(2);
    expect(prov?.parentSpanId).toBe(turn?.spanContext().spanId);
  });

  test('adds an event on the provider span for provider.retry', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('turn.start', { runId: 'r1', turn: 1 });
    bus.emit('provider.call', {
      runId: 'r1',
      providerId: 'p',
      request: { messages: [] },
    });
    bus.emit('provider.retry', {
      runId: 'r1',
      attempt: 2,
      delayMs: 100,
      error: new Error('rate limit'),
    });
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    bus.emit('turn.finish', {
      runId: 'r1',
      turn: 1,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    bus.emit('run.finish', { runId: 'r1', result: {} });

    unsub();

    const spans = exporter.getFinishedSpans();
    const prov = byName(spans, 'harness.provider');
    const retryEv = prov?.events.find((e) => e.name === 'provider.retry');
    expect(retryEv).toBeDefined();
    expect(retryEv?.attributes?.attempt).toBe(2);
    expect(retryEv?.attributes?.delayMs).toBe(100);
  });

  test('adds events on the run span for budget.exceeded and guardrail', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('budget.exceeded', {
      runId: 'r1',
      kind: 'tokens',
      spent: 100,
      limit: 50,
    });
    bus.emit('guardrail', {
      runId: 'r1',
      phase: 'output',
      action: 'block',
    });
    bus.emit('run.finish', { runId: 'r1', result: {} });

    unsub();

    const spans = exporter.getFinishedSpans();
    const run = byName(spans, 'harness.run');
    const budgetEv = run?.events.find((e) => e.name === 'budget.exceeded');
    const guardEv = run?.events.find((e) => e.name === 'guardrail');
    expect(budgetEv).toBeDefined();
    expect(budgetEv?.attributes?.kind).toBe('tokens');
    expect(guardEv).toBeDefined();
    expect(guardEv?.attributes?.phase).toBe('output');
    expect(guardEv?.attributes?.action).toBe('block');
  });

  test('sets error status on the run span for run.error', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('run.error', {
      runId: 'r1',
      error: new ProviderError('run failed', { kind: 'unknown' }),
    });

    unsub();

    const spans = exporter.getFinishedSpans();
    const run = byName(spans, 'harness.run');
    expect(run?.status.code).toBe(2);
    expect(run?.status.message).toBe('run failed');
  });

  test('unsubscribe stops span creation', () => {
    const tracer = getTracer();
    const unsub = otelAdapter(bus, tracer);

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('run.finish', { runId: 'r1', result: {} });
    expect(exporter.getFinishedSpans().length).toBe(1);

    unsub();

    bus.emit('run.start', { runId: 'r2', conversationId: 'c2', input: {} });
    bus.emit('run.finish', { runId: 'r2', result: {} });
    expect(exporter.getFinishedSpans().length).toBe(1);
  });
});
