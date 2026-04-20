import type { Checkpointer } from '@harness/agent';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { UIEvent } from '../../../shared/events.ts';
import type { ProviderKeys } from '../../config.ts';
import { createRunBroadcast, type RunBroadcast } from '../../infra/broadcast.ts';
import { parseJsonBody } from '../../infra/parse-body.ts';
import type { SettingsStore } from '../settings/settings.store.ts';
import { ResearchPlan } from '../tools/deep-research/schemas/plan.ts';
import type { ApprovalStore, HitlPlanDecision } from './sessions.approval.ts';
import type { HitlSessionStore } from './sessions.hitl.ts';
import { type SessionDeps, startSession } from './sessions.runner.ts';
import type { SessionStore } from './sessions.store.ts';

export interface SessionsRouteDeps {
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
  getProviderKeys: () => ProviderKeys;
}

const CreateSessionBody = z.object({
  toolId: z.string().min(1),
  question: z.string().min(1),
  settings: z.record(z.string(), z.unknown()).default({}),
  resumeSessionId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Reserved for future checkpoint resume. When implemented, this will load graph state from the referenced session. Currently accepted but ignored.',
    ),
});

const ApproveBody = z.object({
  decision: z.enum(['approve', 'reject']),
  editedPlan: z.unknown().optional(),
});

async function applyApproveToCheckpoint(
  checkpointer: Checkpointer,
  sessionId: string,
  editedPlan: unknown | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const saved = await checkpointer.load(sessionId);
  if (!saved?.graphState) {
    return { ok: false, error: 'No checkpoint for session' };
  }
  const gs = saved.graphState as { data: Record<string, unknown> };
  gs.data.approved = true;
  if (editedPlan !== undefined) {
    const parsed = ResearchPlan.safeParse(editedPlan);
    if (!parsed.success) {
      return { ok: false, error: 'editedPlan is not a valid research plan' };
    }
    gs.data.plan = parsed.data;
  }
  await checkpointer.save(sessionId, saved);
  return { ok: true };
}

const inflight = new Set<string>();

export function createSessionsRoutes(deps: SessionsRouteDeps) {
  const { sessionStore, settingsStore, approvalStore, hitlSessionStore, getProviderKeys } = deps;
  const routes = new Hono();

  const activeSessions = new Map<string, { broadcast: RunBroadcast; abort: AbortController }>();

  const sessionDeps: SessionDeps = {
    sessionStore,
    settingsStore,
    approvalStore,
    hitlSessionStore,
  };

  routes.post('/', async (c) => {
    const result = await parseJsonBody(c, CreateSessionBody);
    if (!result.ok) {
      return result.response;
    }

    const { toolId, question, settings, resumeSessionId } = result.data;
    const sessionId = crypto.randomUUID();
    const ac = new AbortController();

    try {
      const handle = startSession(
        {
          sessionId,
          toolId,
          question,
          settings,
          ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
          signal: ac.signal,
          abortController: ac,
          providerKeys: getProviderKeys(),
        },
        sessionDeps,
      );

      const broadcast = createRunBroadcast();
      activeSessions.set(sessionId, { broadcast, abort: ac });

      void (async () => {
        try {
          for await (const event of handle.events) {
            broadcast.push(event);
          }
        } finally {
          broadcast.done();
          activeSessions.delete(sessionId);
        }
      })();

      return c.json({ id: sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ error: message }, 400);
    }
  });

  routes.get('/', (c) => {
    const rawStatus = c.req.query('status');
    const q = c.req.query('q');
    const limitStr = c.req.query('limit');
    const limit = limitStr ? Number(limitStr) : undefined;

    const statusResult = rawStatus
      ? z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).safeParse(rawStatus)
      : undefined;
    const status = statusResult?.success ? statusResult.data : undefined;

    const sessions = sessionStore.listSessions({
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      ...(limit ? { limit } : {}),
    });

    return c.json({ sessions });
  });

  routes.get('/:id', (c) => {
    const session = sessionStore.getSession(c.req.param('id'));
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json(session);
  });

  routes.get('/:id/events', (c) => {
    const sessionId = c.req.param('id');
    const active = activeSessions.get(sessionId);

    if (active) {
      const sub = active.broadcast.subscribe();
      return streamSSE(c, async (stream) => {
        for await (const event of sub) {
          await stream.writeSSE({
            event: 'event',
            data: JSON.stringify(event),
          });
        }
        await stream.writeSSE({ event: 'done', data: '{}' });
      });
    }

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const storedEvents = sessionStore.getEvents(sessionId);
    return streamSSE(c, async (stream) => {
      for (const stored of storedEvents) {
        await stream.writeSSE({
          event: 'event',
          data: JSON.stringify({
            type: stored.type,
            ts: stored.ts,
            runId: sessionId,
            ...stored.payload,
          }),
        });
      }
      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  });

  routes.delete('/:id', (c) => {
    const sessionId = c.req.param('id');
    const active = activeSessions.get(sessionId);
    if (active) {
      active.abort.abort();
      active.broadcast.done();
      activeSessions.delete(sessionId);
    }
    sessionStore.deleteSession(sessionId);
    return c.json({ ok: true });
  });

  routes.post('/:id/cancel', (c) => {
    const sessionId = c.req.param('id');
    const active = activeSessions.get(sessionId);
    if (active) {
      active.abort.abort();
      return c.json({ cancelled: true });
    }
    return c.json({ error: 'Session not found or already finished' }, 404);
  });

  routes.post('/:id/approve', async (c) => {
    const sessionId = c.req.param('id');
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (inflight.has(sessionId)) {
      return c.json({ error: 'Approval already in progress' }, 409);
    }

    const parsed = await parseJsonBody(c, ApproveBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    if (!approvalStore.hasPending(sessionId)) {
      return c.json({ error: 'No pending approval' }, 404);
    }

    inflight.add(sessionId);
    try {
      if (parsed.data.decision === 'approve') {
        const hitlSession = hitlSessionStore.get(sessionId);
        if (!hitlSession) {
          return c.json({ error: 'No active session' }, 404);
        }
        const applied = await applyApproveToCheckpoint(
          hitlSession.checkpointer,
          sessionId,
          parsed.data.editedPlan,
        );
        if (!applied.ok) {
          return c.json({ error: applied.error }, 400);
        }
      }

      const resolvedEvent: UIEvent = {
        type: 'hitl-resolved',
        ts: Date.now(),
        runId: sessionId,
        decision: parsed.data.decision,
        ...(parsed.data.decision === 'approve' && parsed.data.editedPlan !== undefined
          ? { editedPlan: parsed.data.editedPlan }
          : {}),
      };
      sessionStore.appendEvent(sessionId, resolvedEvent);

      if (parsed.data.decision === 'reject') {
        const hitlSession = hitlSessionStore.get(sessionId);
        if (hitlSession) {
          hitlSession.abortController.abort();
        }
      }

      const decisionPayload: HitlPlanDecision = {
        decision: parsed.data.decision,
        ...(parsed.data.editedPlan !== undefined ? { editedPlan: parsed.data.editedPlan } : {}),
      };

      if (!approvalStore.resolve(sessionId, decisionPayload)) {
        return c.json({ error: 'No pending approval' }, 404);
      }

      return c.json({ ok: true });
    } finally {
      inflight.delete(sessionId);
    }
  });

  return routes;
}
