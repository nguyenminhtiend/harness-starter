import { createDeepResearchWorkflow } from '@harness/workflows';
import { Mastra } from '@mastra/core';
import type { MastraMemory } from '@mastra/core/memory';
import { LibSQLStore } from '@mastra/libsql';
import type { UIEvent } from '../../../shared/events.ts';
import type { ApprovalStore } from '../../infra/approval.ts';
import { type AccUsage, mastraChunkToUIEvents } from '../../infra/mastra-events.ts';
import type { SessionStore } from '../../infra/session-store.ts';
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
  mastraMemory?: MastraMemory;
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

  throw new Error(`Unknown tool runtime for ${toolId}`);
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
