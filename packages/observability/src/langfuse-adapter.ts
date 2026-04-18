import type { EventBus, HarnessError, HarnessEvents, Usage } from '@harness/core';

export interface LangfuseSpan {
  update(data: Record<string, unknown>): void;
  end(data?: Record<string, unknown>): void;
}

export interface LangfuseGeneration {
  update(data: Record<string, unknown>): void;
  end(data?: Record<string, unknown>): void;
}

export interface LangfuseTrace {
  span(data: Record<string, unknown>): LangfuseSpan;
  generation(data: Record<string, unknown>): LangfuseGeneration;
  update(data: Record<string, unknown>): void;
}

export interface LangfuseClient {
  trace(data: Record<string, unknown>): LangfuseTrace;
}

function usageToLangfuse(tokens: Usage) {
  return {
    promptTokens: tokens.inputTokens,
    completionTokens: tokens.outputTokens,
    totalTokens: tokens.totalTokens,
  };
}

function serializeHarnessError(error: HarnessError): Record<string, unknown> {
  return error.toJSON();
}

export function langfuseAdapter(bus: EventBus, client: LangfuseClient): () => void {
  const traces = new Map<string, LangfuseTrace>();
  const turnSpans = new Map<string, LangfuseSpan>();
  const generations = new Map<string, LangfuseGeneration>();
  const toolStacks = new Map<string, LangfuseSpan[]>();

  const unsubs: (() => void)[] = [];

  function subscribe<K extends keyof HarnessEvents>(
    ev: K,
    handler: (payload: HarnessEvents[K]) => void,
  ) {
    unsubs.push(bus.on(ev, handler));
  }

  subscribe('run.start', ({ runId, conversationId, input }) => {
    const trace = client.trace({
      id: runId,
      name: 'harness.run',
      sessionId: conversationId,
      input,
    });
    traces.set(runId, trace);
  });

  subscribe('run.finish', ({ runId, result }) => {
    traces.get(runId)?.update({ output: result });
  });

  subscribe('run.error', ({ runId, error }) => {
    traces.get(runId)?.update({ metadata: { error: serializeHarnessError(error) } });
  });

  subscribe('turn.start', ({ runId, turn }) => {
    const trace = traces.get(runId);
    if (!trace) {
      return;
    }
    const span = trace.span({ name: 'turn', metadata: { turn } });
    turnSpans.set(`${runId}:${turn}`, span);
  });

  subscribe('turn.finish', ({ runId, turn, usage }) => {
    const span = turnSpans.get(`${runId}:${turn}`);
    if (!span) {
      return;
    }
    span.end({ metadata: { usage } });
    turnSpans.delete(`${runId}:${turn}`);
  });

  let generationSeq = 0;
  const activeGenerationKey = new Map<string, string>();

  subscribe('provider.call', ({ runId, providerId, request }) => {
    const trace = traces.get(runId);
    if (!trace) {
      return;
    }
    const key = `${runId}:${++generationSeq}`;
    const generation = trace.generation({ name: providerId, input: request });
    generations.set(key, generation);
    activeGenerationKey.set(runId, key);
  });

  subscribe('provider.usage', ({ runId, tokens, costUSD, cache }) => {
    const key = activeGenerationKey.get(runId);
    const generation = key ? generations.get(key) : undefined;
    if (!generation) {
      return;
    }
    const metadata: Record<string, unknown> = {};
    if (costUSD !== undefined) {
      metadata.costUSD = costUSD;
    }
    if (cache !== undefined) {
      metadata.cache = cache;
    }
    generation.end({
      usage: usageToLangfuse(tokens),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    });
    if (key) {
      generations.delete(key);
      activeGenerationKey.delete(runId);
    }
  });

  subscribe('tool.start', ({ runId, toolName, args }) => {
    const trace = traces.get(runId);
    if (!trace) {
      return;
    }
    const span = trace.span({ name: toolName, input: args });
    let stack = toolStacks.get(runId);
    if (!stack) {
      stack = [];
      toolStacks.set(runId, stack);
    }
    stack.push(span);
  });

  subscribe('tool.finish', ({ runId, result, durationMs }) => {
    const stack = toolStacks.get(runId);
    const span = stack?.pop();
    if (!span) {
      return;
    }
    span.end({ output: result, metadata: { durationMs } });
  });

  subscribe('tool.error', ({ runId, error }) => {
    const stack = toolStacks.get(runId);
    const span = stack?.pop();
    if (!span) {
      return;
    }
    span.end({ metadata: { error: serializeHarnessError(error) } });
  });

  subscribe('run.finish', ({ runId }) => {
    cleanupRun(runId);
  });

  subscribe('run.error', ({ runId }) => {
    cleanupRun(runId);
  });

  function cleanupRun(runId: string) {
    traces.delete(runId);
    for (const [k] of [...turnSpans.entries()]) {
      if (k.startsWith(`${runId}:`)) {
        turnSpans.delete(k);
      }
    }
    for (const [k] of [...generations.entries()]) {
      if (k.startsWith(`${runId}:`)) {
        generations.delete(k);
      }
    }
    activeGenerationKey.delete(runId);
    toolStacks.delete(runId);
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
