import { createDeepResearchWorkflow } from '@harness/workflows';
import { Mastra } from '@mastra/core';
import type { MastraMemory } from '@mastra/core/memory';
import { LibSQLStore } from '@mastra/libsql';
import type { StreamChunk } from '../../../shared/events.ts';
import type { ApprovalStore } from '../../infra/approval.ts';
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

function chunk(type: string, fields: Record<string, unknown> = {}): StreamChunk {
  return { type, ts: Date.now(), ...fields };
}

function flattenMastraChunk(raw: unknown): StreamChunk {
  const r = raw as { type: string; payload?: Record<string, unknown> };
  if (r.payload && typeof r.payload === 'object') {
    return { type: r.type, ts: Date.now(), ...r.payload };
  }
  return { type: r.type, ts: Date.now() };
}

function emitSessionError(
  sessionStore: SessionStore,
  sessionId: string,
  err: unknown,
  signal: AbortSignal,
): { errorChunk: StreamChunk; statusChunk: StreamChunk } {
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

  const errorChunk = chunk('error', {
    message,
    code: isAbort ? 'CANCELLED' : 'RUNTIME_ERROR',
  });
  try {
    sessionStore.appendEvent(sessionId, errorChunk);
  } catch (_dbErr) {
    // DB may be unavailable during cleanup
  }

  return {
    errorChunk,
    statusChunk: chunk('status', { status }),
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
  sessionStore.appendEvent(sessionId, chunk('status', { status: 'running' }));

  let totalIn = 0;
  let totalOut = 0;

  async function* generate(): AsyncGenerator<StreamChunk> {
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

          const c = flattenMastraChunk(value);

          if (c.type === 'step-finish') {
            const usage = c.totalUsage as
              | { inputTokens?: number; outputTokens?: number }
              | undefined;
            if (usage) {
              totalIn = (usage.inputTokens as number) ?? totalIn;
              totalOut = (usage.outputTokens as number) ?? totalOut;
            }
          }

          sessionStore.appendEvent(sessionId, c);
          yield c;
        }
      } finally {
        reader.releaseLock();
      }

      sessionStore.updateSession(sessionId, {
        status: 'completed',
        finishedAt: new Date().toISOString(),
      });

      const doneChunk = chunk('done', {
        totalTokens: totalIn + totalOut,
        inputTokens: totalIn,
        outputTokens: totalOut,
      });
      sessionStore.appendEvent(sessionId, doneChunk);
      yield doneChunk;

      yield chunk('status', { status: 'completed' });
    } catch (err) {
      const { errorChunk, statusChunk } = emitSessionError(sessionStore, sessionId, err, signal);
      yield errorChunk;
      yield statusChunk;
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
  sessionStore.appendEvent(sessionId, chunk('status', { status: 'running' }));

  async function* generate(): AsyncGenerator<StreamChunk> {
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

      yield chunk('node', { node: 'plan', phase: 'start' });

      const initial = await run.start({ inputData: { question } });

      if (initial.status === 'suspended') {
        const planStep = initial.steps?.plan;
        const planOutput =
          planStep?.status === 'success'
            ? (planStep.output as { plan?: unknown } | undefined)
            : undefined;
        const plan = planOutput?.plan;

        const hitlChunk = chunk('hitl-required', { plan });
        sessionStore.appendEvent(sessionId, hitlChunk);
        yield hitlChunk;

        const approvalPromise = approvalStore.waitFor(sessionId);
        const decision = await approvalPromise;

        const resolvedChunk = chunk('hitl-resolved', {
          decision: decision.decision,
          ...(decision.editedPlan !== undefined ? { editedPlan: decision.editedPlan } : {}),
        });
        sessionStore.appendEvent(sessionId, resolvedChunk);
        yield resolvedChunk;

        if (decision.decision === 'reject') {
          sessionStore.updateSession(sessionId, {
            status: 'cancelled',
            finishedAt: new Date().toISOString(),
          });
          const rejectChunk = chunk('error', {
            message: 'Plan approval rejected',
            code: 'HITL_REJECTED',
          });
          sessionStore.appendEvent(sessionId, rejectChunk);
          yield rejectChunk;
          yield chunk('status', { status: 'cancelled' });
          return;
        }

        if (signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        yield chunk('node', { node: 'research', phase: 'start' });

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

          const doneChunk = chunk('done', {
            totalTokens: 0,
            ...(typeof report === 'string' ? { report } : {}),
          });
          sessionStore.appendEvent(sessionId, doneChunk);
          yield doneChunk;
          yield chunk('status', { status: 'completed' });
        } else {
          throw new Error(`Workflow ended with status: ${resumed.status}`);
        }
      } else if (initial.status === 'success') {
        const report = initial.result?.reportText;
        sessionStore.updateSession(sessionId, {
          status: 'completed',
          finishedAt: new Date().toISOString(),
        });
        const doneChunk = chunk('done', {
          totalTokens: 0,
          ...(typeof report === 'string' ? { report } : {}),
        });
        sessionStore.appendEvent(sessionId, doneChunk);
        yield doneChunk;
        yield chunk('status', { status: 'completed' });
      } else {
        throw new Error(`Workflow ended with status: ${initial.status}`);
      }
    } catch (err) {
      const { errorChunk, statusChunk } = emitSessionError(sessionStore, sessionId, err, signal);
      yield errorChunk;
      yield statusChunk;
    }
  }

  return { sessionId, events: generate() };
}
