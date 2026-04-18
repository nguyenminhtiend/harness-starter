import type { EventBus } from '@harness/core';
import type { Span, Tracer } from '@opentelemetry/api';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';

function startChildSpan(
  tracer: Tracer,
  parent: Span,
  name: string,
  attributes: Record<string, string | number | boolean>,
): Span {
  const ctx = trace.setSpan(context.active(), parent);
  return tracer.startSpan(name, { attributes }, ctx);
}

function endOpenSpansForRun(
  runId: string,
  turnSpans: Map<string, Span>,
  providerSpans: Map<string, Span>,
  toolSpans: Map<string, Span>,
): void {
  for (const [key, span] of [...toolSpans.entries()]) {
    if (key.startsWith(`${runId}:`)) {
      span.end();
      toolSpans.delete(key);
    }
  }
  const providerKey = `${runId}:provider`;
  const providerSpan = providerSpans.get(providerKey);
  if (providerSpan) {
    providerSpan.end();
    providerSpans.delete(providerKey);
  }
  for (const [key, span] of [...turnSpans.entries()]) {
    if (key.startsWith(`${runId}:`)) {
      span.end();
      turnSpans.delete(key);
    }
  }
}

export function otelAdapter(bus: EventBus, tracer: Tracer): () => void {
  const runSpans = new Map<string, Span>();
  const turnSpans = new Map<string, Span>();
  const providerSpans = new Map<string, Span>();
  const toolSpans = new Map<string, Span>();
  const currentTurnByRun = new Map<string, number>();

  const unsubs: (() => void)[] = [];

  unsubs.push(
    bus.on('run.start', (payload) => {
      const { runId, conversationId } = payload;
      const span = tracer.startSpan('harness.run', {
        attributes: { runId, conversationId },
      });
      runSpans.set(runId, span);
    }),
  );

  unsubs.push(
    bus.on('run.finish', (payload) => {
      const { runId } = payload;
      endOpenSpansForRun(runId, turnSpans, providerSpans, toolSpans);
      currentTurnByRun.delete(runId);
      const span = runSpans.get(runId);
      if (span) {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        runSpans.delete(runId);
      }
    }),
  );

  unsubs.push(
    bus.on('run.error', (payload) => {
      const { runId, error } = payload;
      endOpenSpansForRun(runId, turnSpans, providerSpans, toolSpans);
      currentTurnByRun.delete(runId);
      const span = runSpans.get(runId);
      if (span) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        span.end();
        runSpans.delete(runId);
      }
    }),
  );

  unsubs.push(
    bus.on('turn.start', (payload) => {
      const { runId, turn } = payload;
      const runSpan = runSpans.get(runId);
      if (!runSpan) {
        return;
      }
      currentTurnByRun.set(runId, turn);
      const turnKey = `${runId}:${turn}`;
      const existing = turnSpans.get(turnKey);
      if (existing) {
        existing.end();
        turnSpans.delete(turnKey);
      }
      const span = startChildSpan(tracer, runSpan, 'harness.turn', { turn });
      turnSpans.set(turnKey, span);
    }),
  );

  unsubs.push(
    bus.on('turn.finish', (payload) => {
      const { runId, turn, usage } = payload;
      const turnKey = `${runId}:${turn}`;
      const span = turnSpans.get(turnKey);
      if (span) {
        const attrs: Record<string, string | number | boolean> = {};
        if (usage.inputTokens !== undefined) {
          attrs.inputTokens = usage.inputTokens;
        }
        if (usage.outputTokens !== undefined) {
          attrs.outputTokens = usage.outputTokens;
        }
        if (usage.totalTokens !== undefined) {
          attrs.totalTokens = usage.totalTokens;
        }
        span.setAttributes(attrs);
        span.end();
        turnSpans.delete(turnKey);
      }
      currentTurnByRun.delete(runId);
    }),
  );

  unsubs.push(
    bus.on('provider.call', (payload) => {
      const { runId, providerId } = payload;
      const runSpan = runSpans.get(runId);
      if (!runSpan) {
        return;
      }
      const providerKey = `${runId}:provider`;
      const existing = providerSpans.get(providerKey);
      if (existing) {
        existing.end();
        providerSpans.delete(providerKey);
      }
      const turn = currentTurnByRun.get(runId);
      const turnSpan = turn !== undefined ? turnSpans.get(`${runId}:${turn}`) : undefined;
      const parent = turnSpan ?? runSpan;
      const span = startChildSpan(tracer, parent, 'harness.provider', { providerId });
      providerSpans.set(providerKey, span);
    }),
  );

  unsubs.push(
    bus.on('provider.usage', (payload) => {
      const { runId, tokens, costUSD, cache } = payload;
      const providerKey = `${runId}:provider`;
      const span = providerSpans.get(providerKey);
      if (!span) {
        return;
      }
      const attrs: Record<string, string | number | boolean> = {};
      if (tokens.inputTokens !== undefined) {
        attrs.inputTokens = tokens.inputTokens;
      }
      if (tokens.outputTokens !== undefined) {
        attrs.outputTokens = tokens.outputTokens;
      }
      if (tokens.totalTokens !== undefined) {
        attrs.totalTokens = tokens.totalTokens;
      }
      if (costUSD !== undefined) {
        attrs.costUSD = costUSD;
      }
      if (cache) {
        attrs['cache.read'] = cache.read;
        attrs['cache.write'] = cache.write;
      }
      span.setAttributes(attrs);
      span.end();
      providerSpans.delete(providerKey);
    }),
  );

  unsubs.push(
    bus.on('provider.retry', (payload) => {
      const { runId, attempt, delayMs, error } = payload;
      const span = providerSpans.get(`${runId}:provider`);
      if (!span) {
        return;
      }
      span.addEvent('provider.retry', {
        attempt,
        delayMs,
        'error.message': String(error),
      });
    }),
  );

  let toolCallSeq = 0;
  const toolKeyStacks = new Map<string, string[]>();

  unsubs.push(
    bus.on('tool.start', (payload) => {
      const { runId, toolName } = payload;
      const runSpan = runSpans.get(runId);
      if (!runSpan) {
        return;
      }
      const toolKey = `${runId}:${toolName}:${++toolCallSeq}`;
      const turn = currentTurnByRun.get(runId);
      const turnSpan = turn !== undefined ? turnSpans.get(`${runId}:${turn}`) : undefined;
      const parent = turnSpan ?? runSpan;
      const span = startChildSpan(tracer, parent, 'harness.tool', { toolName });
      toolSpans.set(toolKey, span);
      const stackKey = `${runId}:${toolName}`;
      let stack = toolKeyStacks.get(stackKey);
      if (!stack) {
        stack = [];
        toolKeyStacks.set(stackKey, stack);
      }
      stack.push(toolKey);
    }),
  );

  unsubs.push(
    bus.on('tool.finish', (payload) => {
      const { runId, toolName, durationMs } = payload;
      const stackKey = `${runId}:${toolName}`;
      const stack = toolKeyStacks.get(stackKey);
      const toolKey = stack?.pop();
      const span = toolKey ? toolSpans.get(toolKey) : undefined;
      if (span) {
        span.setAttribute('durationMs', durationMs);
        span.end();
        if (toolKey) {
          toolSpans.delete(toolKey);
        }
      }
    }),
  );

  unsubs.push(
    bus.on('tool.error', (payload) => {
      const { runId, toolName, error } = payload;
      const stackKey = `${runId}:${toolName}`;
      const stack = toolKeyStacks.get(stackKey);
      const toolKey = stack?.pop();
      const span = toolKey ? toolSpans.get(toolKey) : undefined;
      if (span) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        span.end();
        if (toolKey) {
          toolSpans.delete(toolKey);
        }
      }
    }),
  );

  unsubs.push(
    bus.on('budget.exceeded', (payload) => {
      const { runId, kind, spent, limit } = payload;
      const span = runSpans.get(runId);
      if (span) {
        span.addEvent('budget.exceeded', { kind, spent, limit });
      }
    }),
  );

  unsubs.push(
    bus.on('guardrail', (payload) => {
      const { runId, phase, action } = payload;
      const span = runSpans.get(runId);
      if (span) {
        span.addEvent('guardrail', { phase, action });
      }
    }),
  );

  unsubs.push(
    bus.on('handoff', (payload) => {
      const { runId, from, to } = payload;
      const span = runSpans.get(runId);
      if (span) {
        span.addEvent('handoff', { from, to });
      }
    }),
  );

  unsubs.push(
    bus.on('checkpoint', (payload) => {
      const { runId, turn, ref } = payload;
      const span = runSpans.get(runId);
      if (span) {
        span.addEvent('checkpoint', { turn, ref });
      }
    }),
  );

  unsubs.push(
    bus.on('compaction', (payload) => {
      const { runId, droppedTurns, summaryTokens } = payload;
      const span = runSpans.get(runId);
      if (span) {
        span.addEvent('compaction', { droppedTurns, summaryTokens });
      }
    }),
  );

  return () => {
    for (const u of unsubs) {
      u();
    }
  };
}
