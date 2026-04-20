import type { AgentEvent } from '@harness/agent';
import { inMemoryCheckpointer, inMemoryStore } from '@harness/agent';
import type { EventBus } from '@harness/core';
import { aiSdkProvider, createEventBus } from '@harness/core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { UIEvent } from '../shared/events.ts';
import type { ToolDef } from '../shared/tool.ts';
import type { Persistence } from './persistence.ts';
import { tools as registry } from './tools/registry.ts';

export interface RunContext {
  runId: string;
  toolId: string;
  question: string;
  settings: Record<string, unknown>;
  signal: AbortSignal;
  persistence: Persistence;
  apiKey: string;
}

export interface RunHandle {
  runId: string;
  events: AsyncIterable<UIEvent>;
}

function createProvider(apiKey: string, modelId: string) {
  const openrouter = createOpenRouter({ apiKey });
  const model = openrouter.chat(modelId);
  return aiSdkProvider(model);
}

function agentEventToUIEvents(
  e: AgentEvent,
  runId: string,
  accUsage: { inputTokens: number; outputTokens: number; costUsd: number },
): UIEvent[] {
  const ts = Date.now();
  const base = { ts, runId };
  const events: UIEvent[] = [];

  switch (e.type) {
    case 'turn-start':
      events.push({ ...base, type: 'agent', phase: `turn-${e.turn}` });
      break;
    case 'tool-start':
      events.push({ ...base, type: 'tool', toolName: e.name, args: e.args });
      break;
    case 'tool-result':
      events.push({
        ...base,
        type: 'tool',
        toolName: '',
        result: String(e.result),
        durationMs: e.durationMs,
      });
      break;
    case 'tool-error':
      events.push({ ...base, type: 'tool', toolName: '', isError: true, result: e.error.message });
      break;
    case 'usage': {
      const inp = e.tokens.inputTokens ?? 0;
      const out = e.tokens.outputTokens ?? 0;
      accUsage.inputTokens += inp;
      accUsage.outputTokens += out;
      events.push({
        ...base,
        type: 'metric',
        inputTokens: accUsage.inputTokens,
        outputTokens: accUsage.outputTokens,
        costUsd: accUsage.costUsd,
      });
      break;
    }
    case 'text-delta':
      events.push({ ...base, type: 'writer', delta: e.delta });
      break;
    case 'handoff':
      events.push({ ...base, type: 'agent', phase: e.to, message: `${e.from} → ${e.to}` });
      break;
    case 'checkpoint':
      events.push({ ...base, type: 'agent', phase: 'checkpoint' });
      break;
    case 'budget.exceeded':
      events.push({
        ...base,
        type: 'error',
        message: `Budget exceeded: ${e.kind} (${e.spent}/${e.limit})`,
        code: 'BUDGET_EXCEEDED',
      });
      break;
    case 'abort':
      events.push({ ...base, type: 'error', message: 'Run aborted', code: 'ABORTED' });
      break;
    default:
      break;
  }

  return events;
}

function bridgeBusToUIEvents(
  bus: EventBus,
  runId: string,
  accUsage: { inputTokens: number; outputTokens: number; costUsd: number },
  push: (ev: UIEvent) => void,
): () => void {
  const unsubs: (() => void)[] = [];
  const ts = () => Date.now();

  unsubs.push(
    bus.on('handoff', (p) => {
      if (p.runId === runId) {
        push({ ts: ts(), runId, type: 'agent', phase: p.to, message: `${p.from} → ${p.to}` });
      }
    }),
  );

  unsubs.push(
    bus.on('tool.start', (p) => {
      if (p.runId === runId) {
        push({ ts: ts(), runId, type: 'tool', toolName: p.toolName, args: p.args });
      }
    }),
  );

  unsubs.push(
    bus.on('tool.finish', (p) => {
      if (p.runId === runId) {
        push({
          ts: ts(),
          runId,
          type: 'tool',
          toolName: '',
          result: String(p.result),
          durationMs: p.durationMs,
        });
      }
    }),
  );

  unsubs.push(
    bus.on('provider.usage', (p) => {
      if (p.runId === runId) {
        accUsage.inputTokens += p.tokens.inputTokens ?? 0;
        accUsage.outputTokens += p.tokens.outputTokens ?? 0;
        if (p.costUSD) {
          accUsage.costUsd += p.costUSD;
        }
        push({
          ts: ts(),
          runId,
          type: 'metric',
          inputTokens: accUsage.inputTokens,
          outputTokens: accUsage.outputTokens,
          costUsd: accUsage.costUsd,
        });
      }
    }),
  );

  return () => {
    for (const u of unsubs) {
      u();
    }
  };
}

export function startRun(ctx: RunContext): RunHandle {
  const { runId, toolId, question, settings, signal, persistence, apiKey } = ctx;

  const toolDef = registry[toolId] as ToolDef | undefined;
  if (!toolDef) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const modelId = (settings.model as string) ?? 'openrouter/free';
  const provider = createProvider(apiKey, modelId);
  const store = inMemoryStore();
  const checkpointer = inMemoryCheckpointer();
  const bus = createEventBus();

  const mergedSettings = Object.assign(
    {},
    toolDef.defaultSettings as Record<string, unknown>,
    settings,
  );
  const parsedSettings = toolDef.settingsSchema.parse(mergedSettings);

  const agent = toolDef.buildAgent({
    settings: parsedSettings,
    provider,
    store,
    checkpointer,
    bus,
    signal,
  });

  persistence.createRun({ id: runId, toolId, question, status: 'running' });
  persistence.appendEvent(runId, { type: 'status', status: 'running', ts: Date.now(), runId });

  const accUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  async function* generate(): AsyncGenerator<UIEvent> {
    const pushQueue: UIEvent[] = [];
    const unsubBus = bridgeBusToUIEvents(bus, runId, accUsage, (ev) => {
      pushQueue.push(ev);
      persistence.appendEvent(runId, ev);
    });

    try {
      if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const stream = agent.stream(
        { userMessage: `<user_question>${question}</user_question>` },
        { signal, runId },
      );

      for await (const event of stream) {
        // Drain any bus-originated events first
        while (pushQueue.length > 0) {
          const queued = pushQueue.shift();
          if (queued) {
            yield queued;
          }
        }

        const uiEvents = agentEventToUIEvents(event, runId, accUsage);
        for (const uiEv of uiEvents) {
          persistence.appendEvent(runId, uiEv);
          yield uiEv;
        }
      }

      // Drain remaining bus events
      while (pushQueue.length > 0) {
        const queued = pushQueue.shift();
        if (queued) {
          yield queued;
        }
      }

      const totalTokens = accUsage.inputTokens + accUsage.outputTokens;
      persistence.updateRun(runId, {
        status: 'completed',
        costUsd: accUsage.costUsd,
        totalTokens,
        finishedAt: new Date().toISOString(),
      });

      const completeEvent: UIEvent = {
        type: 'complete',
        ts: Date.now(),
        runId,
        totalTokens,
        totalCostUsd: accUsage.costUsd,
      };
      persistence.appendEvent(runId, completeEvent);
      yield completeEvent;

      yield { type: 'status', status: 'completed', ts: Date.now(), runId };
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError' || signal.aborted;
      const status = isAbort ? 'cancelled' : 'failed';
      const message = isAbort ? 'Run cancelled' : ((err as Error).message ?? 'Unknown error');

      persistence.updateRun(runId, {
        status,
        finishedAt: new Date().toISOString(),
      });

      const errorEvent: UIEvent = {
        type: 'error',
        ts: Date.now(),
        runId,
        message,
        code: isAbort ? 'CANCELLED' : 'RUNTIME_ERROR',
      };
      persistence.appendEvent(runId, errorEvent);
      yield errorEvent;

      yield { type: 'status', status, ts: Date.now(), runId };
    } finally {
      unsubBus();
    }
  }

  return { runId, events: generate() };
}
