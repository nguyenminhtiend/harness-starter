import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import type { RunState } from '@harness/agent';
import { inMemoryCheckpointer, inMemoryStore } from '@harness/agent';
import { aiSdkProvider, createEventBus } from '@harness/core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { UIEvent } from '../../../shared/events.ts';
import type { ToolDef } from '../../../shared/tool.ts';
import type { ProviderKeys } from '../../config.ts';
import { mergeToolRuntimeSettings } from '../settings/settings.reader.ts';
import type { SettingsStore } from '../settings/settings.store.ts';
import { tools as registry } from '../tools/tools.registry.ts';
import type { ApprovalStore } from './sessions.approval.ts';
import { agentEventToUIEvents, bridgeBusToUIEvents } from './sessions.bridge.ts';
import type { HitlSessionStore } from './sessions.hitl.ts';
import type { SessionStore } from './sessions.store.ts';
import type { SessionContext, SessionHandle } from './sessions.types.ts';

export interface SessionDeps {
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
}

export function parseModelSpec(raw: string): { provider: string; model: string } {
  const idx = raw.indexOf(':');
  if (idx === -1) {
    return { provider: 'openrouter', model: raw };
  }
  return { provider: raw.slice(0, idx), model: raw.slice(idx + 1) };
}

function createProvider(keys: ProviderKeys, modelSpec: string) {
  const { provider, model } = parseModelSpec(modelSpec);

  if (provider === 'google') {
    const key = keys.google;
    if (!key) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured');
    }
    const google = createGoogleGenerativeAI({ apiKey: key });
    return aiSdkProvider(google(model));
  }

  if (provider === 'openrouter') {
    const key = keys.openrouter;
    if (!key) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }
    const openrouter = createOpenRouter({ apiKey: key });
    return aiSdkProvider(openrouter.chat(model));
  }

  if (provider === 'groq') {
    const key = keys.groq;
    if (!key) {
      throw new Error('GROQ_API_KEY not configured');
    }
    const groq = createGroq({ apiKey: key });
    return aiSdkProvider(groq(model));
  }

  throw new Error(
    `Unknown provider: "${provider}". Use "google:", "openrouter:", or "groq:" prefix.`,
  );
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

export function startSession(ctx: SessionContext, deps: SessionDeps): SessionHandle {
  const { sessionId, toolId, question, settings, signal, abortController, providerKeys } = ctx;
  const { sessionStore, settingsStore, approvalStore, hitlSessionStore } = deps;

  const toolDef = registry[toolId] as ToolDef | undefined;
  if (!toolDef) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const mergedSettings = mergeToolRuntimeSettings(toolId, settingsStore, settings);
  const modelSpec = (mergedSettings.model as string) ?? 'google:gemini-2.5-flash';
  const provider = createProvider(providerKeys, modelSpec);
  const store = inMemoryStore();
  const checkpointer = inMemoryCheckpointer();
  const bus = createEventBus();

  const parsedSettings = toolDef.settingsSchema.parse(mergedSettings);

  const agent = toolDef.buildAgent({
    settings: parsedSettings,
    provider,
    store,
    checkpointer,
    bus,
    signal,
  });

  sessionStore.createSession({ id: sessionId, toolId, question, status: 'running' });
  sessionStore.appendEvent(sessionId, {
    type: 'status',
    status: 'running',
    ts: Date.now(),
    runId: sessionId,
  });

  const accUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  async function* generate(): AsyncGenerator<UIEvent> {
    const pushQueue: UIEvent[] = [];
    const unsubBus = bridgeBusToUIEvents(bus, sessionId, accUsage, (ev) => {
      pushQueue.push(ev);
      sessionStore.appendEvent(sessionId, ev);
    });

    function* drainQueue(): Generator<UIEvent> {
      while (pushQueue.length > 0) {
        const queued = pushQueue.shift();
        if (queued) {
          yield queued;
        }
      }
    }

    hitlSessionStore.register(sessionId, { checkpointer, abortController });

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
          yield* drainQueue();

          const uiEvents = agentEventToUIEvents(event, sessionId, accUsage);
          for (const uiEv of uiEvents) {
            sessionStore.appendEvent(sessionId, uiEv);
            yield uiEv;
          }
        }

        yield* drainQueue();

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
      const isAbort = (err as Error).name === 'AbortError' || signal.aborted;
      const status = isAbort ? 'cancelled' : 'failed';
      const message = isAbort ? 'Session cancelled' : ((err as Error).message ?? 'Unknown error');

      sessionStore.updateSession(sessionId, {
        status,
        finishedAt: new Date().toISOString(),
      });

      const errorEvent: UIEvent = {
        type: 'error',
        ts: Date.now(),
        runId: sessionId,
        message,
        code: isAbort ? 'CANCELLED' : 'RUNTIME_ERROR',
      };
      sessionStore.appendEvent(sessionId, errorEvent);
      yield errorEvent;

      yield { type: 'status', status, ts: Date.now(), runId: sessionId };
    } finally {
      unsubBus();
      hitlSessionStore.unregister(sessionId);
    }
  }

  return { sessionId, events: generate() };
}
