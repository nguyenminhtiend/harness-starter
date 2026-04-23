import type { ConversationStore, RunState } from '@harness/agent';
import { inMemoryCheckpointer, inMemoryStore } from '@harness/agent';
import { createEventBus } from '@harness/core';
import type { ApprovalStore, HitlSessionStore } from '@harness/hitl';
import { createProvider } from '@harness/llm-adapter';
import { consoleSink } from '@harness/observability';
import type { LlmMessage, UIEvent } from '@harness/session-events';
import { agentEventToUIEvents } from '@harness/session-events';
import type { SessionStore } from '@harness/session-store';
import { createDeepResearchWorkflow } from '@harness/workflows';
import { Mastra } from '@mastra/core';
import type { MastraMemory } from '@mastra/core/memory';
import { LibSQLStore } from '@mastra/libsql';
import { type AccUsage, mastraChunkToUIEvents } from '../../infra/mastra-events.ts';
import { resolveSettings } from '../settings/settings.reader.ts';
import type { SettingsStore } from '../settings/settings.store.ts';
import { tools as registry } from '../tools/tools.registry.ts';
import {
  isMastraToolDef,
  isMastraWorkflowToolDef,
  type MastraToolDef,
  type MastraWorkflowToolDef,
  type ToolDef,
} from '../tools/types.ts';
import type { SessionContext, SessionHandle } from './sessions.types.ts';

export interface SessionDeps {
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
  conversationStores?: Map<string, ConversationStore>;
  mastraMemory?: MastraMemory;
}

function isPausedAtPlanApproval(saved: RunState | null): boolean {
  if (!saved?.graphState) {
    return false;
  }
  const gs = saved.graphState as {
    completed: boolean;
    currentNode: string;
    data: { approved?: boolean };
  };
  return !gs.completed && gs.currentNode === 'approve' && gs.data.approved !== true;
}

function planFromCheckpoint(saved: RunState | null): unknown {
  const gs = saved?.graphState as { data: { plan?: unknown } } | undefined;
  return gs?.data?.plan;
}

function coerceMessages(raw: unknown): LlmMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({
      role: typeof m.role === 'string' ? m.role : 'unknown',
      content: m.content,
    }));
}

function toResultString(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function emitSessionError(
  sessionStore: SessionStore,
  sessionId: string,
  err: unknown,
  signal: AbortSignal,
): { errorEvent: UIEvent; statusEvent: UIEvent } {
  const isAbort = (err as Error).name === 'AbortError' || signal.aborted;
  const status = isAbort ? 'cancelled' : 'failed';
  const message = isAbort ? 'Session cancelled' : ((err as Error).message ?? 'Unknown error');

  try {
    sessionStore.updateSession(sessionId, {
      status,
      finishedAt: new Date().toISOString(),
    });
  } catch (_dbErr) {
    // DB may be unavailable during cleanup
  }

  const errorEvent: UIEvent = {
    type: 'error',
    ts: Date.now(),
    runId: sessionId,
    message,
    code: isAbort ? 'CANCELLED' : 'RUNTIME_ERROR',
  };
  try {
    sessionStore.appendEvent(sessionId, errorEvent);
  } catch (_dbErr) {
    // DB may be unavailable during cleanup
  }

  return {
    errorEvent,
    statusEvent: { type: 'status', status, ts: Date.now(), runId: sessionId },
  };
}

export function startSession(ctx: SessionContext, deps: SessionDeps): SessionHandle {
  const { toolId } = ctx;

  const toolDef = registry[toolId] as ToolDef | undefined;
  if (!toolDef) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  if (isMastraWorkflowToolDef(toolDef)) {
    return startMastraWorkflowSession(ctx, deps, toolDef);
  }

  if (isMastraToolDef(toolDef)) {
    return startMastraSession(ctx, deps, toolDef);
  }

  return startHarnessSession(ctx, deps, toolDef);
}

function startMastraSession(
  ctx: SessionContext,
  deps: SessionDeps,
  toolDef: MastraToolDef,
): SessionHandle {
  const { sessionId, question, settings, signal } = ctx;
  const { sessionStore, settingsStore } = deps;

  const mergedSettings = resolveSettings(ctx.toolId, settingsStore, settings);
  const parsedSettings = toolDef.settingsSchema.parse(mergedSettings);

  const agent = toolDef.createAgent(parsedSettings, {
    ...(deps.mastraMemory ? { memory: deps.mastraMemory } : {}),
  });

  sessionStore.createSession({
    id: sessionId,
    toolId: ctx.toolId,
    question,
    status: 'running',
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
  });
  sessionStore.appendEvent(sessionId, {
    type: 'status',
    status: 'running',
    ts: Date.now(),
    runId: sessionId,
  });

  const accUsage: AccUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  async function* generate(): AsyncGenerator<UIEvent> {
    try {
      if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const threadId = ctx.conversationId ?? sessionId;
      const memoryOpt = deps.mastraMemory
        ? { memory: { thread: threadId, resource: 'web-studio' } }
        : {};

      const output = await agent.stream(question, {
        ...memoryOpt,
        abortSignal: signal,
        maxSteps: (parsedSettings as { maxTurns?: number }).maxTurns ?? 5,
      });

      const reader = output.fullStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunk = value as { type: string; payload?: Record<string, unknown> };
          const uiEvents = mastraChunkToUIEvents(chunk, sessionId, accUsage);
          for (const ev of uiEvents) {
            sessionStore.appendEvent(sessionId, ev);
            yield ev;
          }
        }
      } finally {
        reader.releaseLock();
      }

      const totalTokens = accUsage.inputTokens + accUsage.outputTokens;
      sessionStore.updateSession(sessionId, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
      });

      const completeEvent: UIEvent = {
        type: 'complete',
        ts: Date.now(),
        runId: sessionId,
        totalTokens,
        totalCostUsd: accUsage.costUsd,
      };
      sessionStore.appendEvent(sessionId, completeEvent);
      yield completeEvent;

      yield { type: 'status', status: 'completed', ts: Date.now(), runId: sessionId };
    } catch (err) {
      const { errorEvent, statusEvent } = emitSessionError(sessionStore, sessionId, err, signal);
      yield errorEvent;
      yield statusEvent;
    }
  }

  return { sessionId, events: generate() };
}

function startMastraWorkflowSession(
  ctx: SessionContext,
  deps: SessionDeps,
  toolDef: MastraWorkflowToolDef,
): SessionHandle {
  const { sessionId, question, settings, signal } = ctx;
  const { sessionStore, settingsStore, approvalStore } = deps;

  const mergedSettings = resolveSettings(ctx.toolId, settingsStore, settings);
  const parsedSettings = toolDef.settingsSchema.parse(mergedSettings);
  const wfConfig = toolDef.createWorkflowConfig(parsedSettings);

  sessionStore.createSession({
    id: sessionId,
    toolId: ctx.toolId,
    question,
    status: 'running',
  });
  sessionStore.appendEvent(sessionId, {
    type: 'status',
    status: 'running',
    ts: Date.now(),
    runId: sessionId,
  });

  async function* generate(): AsyncGenerator<UIEvent> {
    try {
      if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      const workflow = createDeepResearchWorkflow(wfConfig);
      const mastra = new Mastra({
        workflows: { deepResearch: workflow },
        storage: new LibSQLStore({
          id: `wf-${sessionId}`,
          url: 'file::memory:?cache=shared',
        }),
      });
      const wf = mastra.getWorkflow('deepResearch');
      const run = await wf.createRun();

      yield { type: 'node', ts: Date.now(), runId: sessionId, node: 'plan', phase: 'start' };

      const initial = await run.start({ inputData: { question } });

      if (initial.status === 'suspended') {
        const planStep = initial.steps?.plan;
        const planOutput =
          planStep?.status === 'success'
            ? (planStep.output as { plan?: unknown } | undefined)
            : undefined;
        const plan = planOutput?.plan;

        const hitlRequired: UIEvent = {
          type: 'hitl-required',
          ts: Date.now(),
          runId: sessionId,
          plan,
        };
        sessionStore.appendEvent(sessionId, hitlRequired);
        yield hitlRequired;

        const approvalPromise = approvalStore.waitFor(sessionId);
        const decision = await approvalPromise;

        const resolvedUi: UIEvent = {
          type: 'hitl-resolved',
          ts: Date.now(),
          runId: sessionId,
          decision: decision.decision,
          ...(decision.editedPlan !== undefined ? { editedPlan: decision.editedPlan } : {}),
        };
        sessionStore.appendEvent(sessionId, resolvedUi);
        yield resolvedUi;

        if (decision.decision === 'reject') {
          sessionStore.updateSession(sessionId, {
            status: 'cancelled',
            finishedAt: new Date().toISOString(),
          });
          const rejectEvent: UIEvent = {
            type: 'error',
            ts: Date.now(),
            runId: sessionId,
            message: 'Plan approval rejected',
            code: 'HITL_REJECTED',
          };
          sessionStore.appendEvent(sessionId, rejectEvent);
          yield rejectEvent;
          yield { type: 'status', status: 'cancelled', ts: Date.now(), runId: sessionId };
          return;
        }

        if (signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        yield { type: 'node', ts: Date.now(), runId: sessionId, node: 'research', phase: 'start' };

        const resumed = await run.resume({
          step: 'approve',
          resumeData: { approved: true },
        });

        if (resumed.status === 'success') {
          const report = resumed.result?.reportText;
          sessionStore.updateSession(sessionId, {
            status: 'completed',
            finishedAt: new Date().toISOString(),
          });

          const completeEvent: UIEvent = {
            type: 'complete',
            ts: Date.now(),
            runId: sessionId,
            totalTokens: 0,
            totalCostUsd: 0,
            ...(typeof report === 'string' ? { report } : {}),
          };
          sessionStore.appendEvent(sessionId, completeEvent);
          yield completeEvent;
          yield { type: 'status', status: 'completed', ts: Date.now(), runId: sessionId };
        } else {
          throw new Error(`Workflow ended with status: ${resumed.status}`);
        }
      } else if (initial.status === 'success') {
        const report = initial.result?.reportText;
        sessionStore.updateSession(sessionId, {
          status: 'completed',
          finishedAt: new Date().toISOString(),
        });
        const completeEvent: UIEvent = {
          type: 'complete',
          ts: Date.now(),
          runId: sessionId,
          totalTokens: 0,
          totalCostUsd: 0,
          ...(typeof report === 'string' ? { report } : {}),
        };
        sessionStore.appendEvent(sessionId, completeEvent);
        yield completeEvent;
        yield { type: 'status', status: 'completed', ts: Date.now(), runId: sessionId };
      } else {
        throw new Error(`Workflow ended with status: ${initial.status}`);
      }
    } catch (err) {
      const { errorEvent, statusEvent } = emitSessionError(sessionStore, sessionId, err, signal);
      yield errorEvent;
      yield statusEvent;
    }
  }

  return { sessionId, events: generate() };
}

function startHarnessSession(
  ctx: SessionContext,
  deps: SessionDeps,
  toolDef: ToolDef,
): SessionHandle {
  const { sessionId, question, settings, signal, abortController, providerKeys } = ctx;
  const { sessionStore, settingsStore, approvalStore, hitlSessionStore } = deps;

  const mergedSettings = resolveSettings(ctx.toolId, settingsStore, settings);
  const modelSpec = (mergedSettings.model as string) ?? 'google:gemini-2.5-flash';
  const provider = createProvider(providerKeys, modelSpec);

  let store: ConversationStore;
  if (ctx.conversationId && deps.conversationStores) {
    const existing = deps.conversationStores.get(ctx.conversationId);
    if (existing) {
      store = existing;
    } else {
      store = inMemoryStore();
      deps.conversationStores.set(ctx.conversationId, store);
    }
  } else {
    store = inMemoryStore();
  }
  const checkpointer = inMemoryCheckpointer();
  const bus = createEventBus();

  const parsedSettings = toolDef.settingsSchema.parse(mergedSettings);

  const accUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const toolNames = new Map<string, string>();
  const pendingBusEvents: UIEvent[] = [];

  function enqueue(ev: UIEvent): void {
    pendingBusEvents.push(ev);
  }

  if (!('buildAgent' in toolDef)) {
    throw new Error(`Tool ${ctx.toolId} is not a harness tool`);
  }

  const agent = toolDef.buildAgent({
    settings: parsedSettings,
    provider,
    store,
    checkpointer,
    bus,
    signal,
    pushUIEvent: enqueue,
  });

  sessionStore.createSession({
    id: sessionId,
    toolId: ctx.toolId,
    question,
    status: 'running',
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
  });
  sessionStore.appendEvent(sessionId, {
    type: 'status',
    status: 'running',
    ts: Date.now(),
    runId: sessionId,
  });

  const unsubs: (() => void)[] = [];

  unsubs.push(
    bus.on('provider.call', (p) => {
      const req = p.request as { messages?: unknown } | undefined;
      enqueue({
        ts: Date.now(),
        runId: sessionId,
        type: 'llm',
        phase: 'request',
        providerId: p.providerId,
        messages: coerceMessages(req?.messages),
      });
    }),
  );

  unsubs.push(
    bus.on('provider.usage', (p) => {
      accUsage.inputTokens += p.tokens.inputTokens ?? 0;
      accUsage.outputTokens += p.tokens.outputTokens ?? 0;
      if (p.costUSD) {
        accUsage.costUsd += p.costUSD;
      }
      enqueue({
        ts: Date.now(),
        runId: sessionId,
        type: 'metric',
        inputTokens: accUsage.inputTokens,
        outputTokens: accUsage.outputTokens,
        costUsd: accUsage.costUsd,
      });
    }),
  );

  unsubs.push(
    bus.on('tool.start', (p) => {
      enqueue({
        ts: Date.now(),
        runId: sessionId,
        type: 'tool',
        toolName: p.toolName,
        args: p.args,
      });
    }),
  );

  unsubs.push(
    bus.on('tool.finish', (p) => {
      enqueue({
        ts: Date.now(),
        runId: sessionId,
        type: 'tool',
        toolName: p.toolName,
        result: toResultString(p.result),
        durationMs: p.durationMs,
      });
    }),
  );

  unsubs.push(
    bus.on('tool.error', (p) => {
      enqueue({
        ts: Date.now(),
        runId: sessionId,
        type: 'tool',
        toolName: p.toolName,
        isError: true,
        result: p.error.message,
      });
    }),
  );

  unsubs.push(
    bus.on('turn.start', (p) => {
      enqueue({
        ts: Date.now(),
        runId: sessionId,
        type: 'agent',
        phase: `turn-${p.turn}`,
      });
    }),
  );

  async function* generate(): AsyncGenerator<UIEvent> {
    const unsubConsole = consoleSink(bus, { level: 'normal' });

    hitlSessionStore.register(sessionId, { checkpointer, abortController });

    function* drainBus(): Generator<UIEvent> {
      while (pendingBusEvents.length > 0) {
        const ev = pendingBusEvents.shift();
        if (!ev) {
          break;
        }
        sessionStore.appendEvent(sessionId, ev);
        yield ev;
      }
    }

    try {
      if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      while (true) {
        const stream = agent.stream(
          { userMessage: `<user_question>${question}</user_question>` },
          { signal, runId: sessionId },
        );

        for await (const event of stream) {
          yield* drainBus();
          const uiEvents = agentEventToUIEvents(event, sessionId, accUsage, toolNames);
          for (const uiEv of uiEvents) {
            sessionStore.appendEvent(sessionId, uiEv);
            yield uiEv;
          }
        }
        yield* drainBus();

        const saved = await checkpointer.load(sessionId);
        if (!isPausedAtPlanApproval(saved)) {
          break;
        }

        const approvalPromise = approvalStore.waitFor(sessionId);
        const plan = planFromCheckpoint(saved);
        const hitlRequired: UIEvent = {
          type: 'hitl-required',
          ts: Date.now(),
          runId: sessionId,
          plan,
        };
        sessionStore.appendEvent(sessionId, hitlRequired);
        yield hitlRequired;

        const decision = await approvalPromise;

        const resolvedUi: UIEvent = {
          type: 'hitl-resolved',
          ts: Date.now(),
          runId: sessionId,
          decision: decision.decision,
          ...(decision.editedPlan !== undefined ? { editedPlan: decision.editedPlan } : {}),
        };
        yield resolvedUi;

        if (decision.decision === 'reject') {
          sessionStore.updateSession(sessionId, {
            status: 'cancelled',
            finishedAt: new Date().toISOString(),
          });

          const rejectEvent: UIEvent = {
            type: 'error',
            ts: Date.now(),
            runId: sessionId,
            message: 'Plan approval rejected',
            code: 'HITL_REJECTED',
          };
          sessionStore.appendEvent(sessionId, rejectEvent);
          yield rejectEvent;

          yield { type: 'status', status: 'cancelled', ts: Date.now(), runId: sessionId };
          return;
        }

        if (signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
      }

      const totalTokens = accUsage.inputTokens + accUsage.outputTokens;
      sessionStore.updateSession(sessionId, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
      });

      let report: string | undefined;
      const finalCheckpoint = await checkpointer.load(sessionId);
      if (finalCheckpoint?.graphState) {
        const gs = finalCheckpoint.graphState as { data?: { reportText?: string } };
        if (typeof gs.data?.reportText === 'string' && gs.data.reportText.trim().length > 0) {
          report = gs.data.reportText;
        }
      }

      const completeEvent: UIEvent = {
        type: 'complete',
        ts: Date.now(),
        runId: sessionId,
        totalTokens,
        totalCostUsd: accUsage.costUsd,
        ...(report ? { report } : {}),
      };
      sessionStore.appendEvent(sessionId, completeEvent);
      yield completeEvent;

      yield { type: 'status', status: 'completed', ts: Date.now(), runId: sessionId };
    } catch (err) {
      const { errorEvent, statusEvent } = emitSessionError(sessionStore, sessionId, err, signal);
      yield errorEvent;
      yield statusEvent;
    } finally {
      unsubConsole();
      for (const u of unsubs) {
        u();
      }
      hitlSessionStore.unregister(sessionId);
    }
  }

  return { sessionId, events: generate() };
}
