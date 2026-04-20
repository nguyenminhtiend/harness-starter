import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
import type { ApprovalStore } from './runs.approval.ts';
import { agentEventToUIEvents, bridgeBusToUIEvents } from './runs.bridge.ts';
import type { HitlSessionStore } from './runs.hitl.ts';
import type { RunStore } from './runs.store.ts';
import type { RunContext, RunHandle } from './runs.types.ts';

export interface RunDeps {
  runStore: RunStore;
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

  throw new Error(`Unknown provider: "${provider}". Use "google:" or "openrouter:" prefix.`);
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

export function startRun(ctx: RunContext, deps: RunDeps): RunHandle {
  const { runId, toolId, question, settings, signal, abortController, providerKeys } = ctx;
  const { runStore, settingsStore, approvalStore, hitlSessionStore } = deps;

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

  runStore.createRun({ id: runId, toolId, question, status: 'running' });
  runStore.appendEvent(runId, { type: 'status', status: 'running', ts: Date.now(), runId });

  const accUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  async function* generate(): AsyncGenerator<UIEvent> {
    const pushQueue: UIEvent[] = [];
    const unsubBus = bridgeBusToUIEvents(bus, runId, accUsage, (ev) => {
      pushQueue.push(ev);
      runStore.appendEvent(runId, ev);
    });

    function* drainQueue(): Generator<UIEvent> {
      while (pushQueue.length > 0) {
        const queued = pushQueue.shift();
        if (queued) {
          yield queued;
        }
      }
    }

    hitlSessionStore.register(runId, { checkpointer, abortController });

    try {
      if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      while (true) {
        const stream = agent.stream(
          { userMessage: `<user_question>${question}</user_question>` },
          { signal, runId },
        );

        for await (const event of stream) {
          yield* drainQueue();

          const uiEvents = agentEventToUIEvents(event, runId, accUsage);
          for (const uiEv of uiEvents) {
            runStore.appendEvent(runId, uiEv);
            yield uiEv;
          }
        }

        yield* drainQueue();

        const saved = await checkpointer.load(runId);
        if (!isPausedAtPlanApproval(saved)) {
          break;
        }

        const approvalPromise = approvalStore.waitFor(runId);
        const plan = planFromCheckpoint(saved);
        const hitlRequired: UIEvent = {
          type: 'hitl-required',
          ts: Date.now(),
          runId,
          plan,
        };
        runStore.appendEvent(runId, hitlRequired);
        yield hitlRequired;

        const decision = await approvalPromise;

        const resolvedUi: UIEvent = {
          type: 'hitl-resolved',
          ts: Date.now(),
          runId,
          decision: decision.decision,
          ...(decision.editedPlan !== undefined ? { editedPlan: decision.editedPlan } : {}),
        };
        yield resolvedUi;

        if (decision.decision === 'reject') {
          runStore.updateRun(runId, {
            status: 'cancelled',
            finishedAt: new Date().toISOString(),
          });

          const rejectEvent: UIEvent = {
            type: 'error',
            ts: Date.now(),
            runId,
            message: 'Plan approval rejected',
            code: 'HITL_REJECTED',
          };
          runStore.appendEvent(runId, rejectEvent);
          yield rejectEvent;

          yield { type: 'status', status: 'cancelled', ts: Date.now(), runId };
          return;
        }

        if (signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
      }

      const totalTokens = accUsage.inputTokens + accUsage.outputTokens;
      runStore.updateRun(runId, {
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
      runStore.appendEvent(runId, completeEvent);
      yield completeEvent;

      yield { type: 'status', status: 'completed', ts: Date.now(), runId };
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError' || signal.aborted;
      const status = isAbort ? 'cancelled' : 'failed';
      const message = isAbort ? 'Run cancelled' : ((err as Error).message ?? 'Unknown error');

      runStore.updateRun(runId, {
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
      runStore.appendEvent(runId, errorEvent);
      yield errorEvent;

      yield { type: 'status', status, ts: Date.now(), runId };
    } finally {
      unsubBus();
      hitlSessionStore.unregister(runId);
    }
  }

  return { runId, events: generate() };
}
