import type { RunState } from '@harness/agent';
import { inMemoryCheckpointer, inMemoryStore } from '@harness/agent';
import { createEventBus } from '@harness/core';
import type { ApprovalStore, HitlSessionStore } from '@harness/hitl';
import { createProvider } from '@harness/llm-adapter';
import { consoleSink } from '@harness/observability';
import type { UIEvent } from '@harness/session-events';
import { agentEventToUIEvents } from '@harness/session-events';
import type { SessionStore } from '@harness/session-store';
import { mergeToolRuntimeSettings } from '../settings/settings.reader.ts';
import type { SettingsStore } from '../settings/settings.store.ts';
import { tools as registry } from '../tools/tools.registry.ts';
import type { ToolDef } from '../tools/types.ts';
import type { SessionContext, SessionHandle } from './sessions.types.ts';

export interface SessionDeps {
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
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
  const toolNames = new Map<string, string>();

  async function* generate(): AsyncGenerator<UIEvent> {
    const unsubConsole = consoleSink(bus, { level: 'normal' });

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
          const uiEvents = agentEventToUIEvents(event, sessionId, accUsage, toolNames);
          for (const uiEv of uiEvents) {
            sessionStore.appendEvent(sessionId, uiEv);
            yield uiEv;
          }
        }

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
      const isAbort = (err as Error).name === 'AbortError' || signal.aborted;
      const status = isAbort ? 'cancelled' : 'failed';
      const message = isAbort ? 'Session cancelled' : ((err as Error).message ?? 'Unknown error');

      try {
        sessionStore.updateSession(sessionId, {
          status,
          finishedAt: new Date().toISOString(),
        });
      } catch (_dbErr) {
        // DB may be unavailable during cleanup (e.g. connection closed)
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
      yield errorEvent;

      yield { type: 'status', status, ts: Date.now(), runId: sessionId };
    } finally {
      unsubConsole();
      hitlSessionStore.unregister(sessionId);
    }
  }

  return { sessionId, events: generate() };
}
