import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { UIEvent } from '../../../shared/events.ts';
import type { ApprovalDecision, ApprovalStore } from '../../infra/approval.ts';
import { createRunBroadcast, type RunBroadcast } from '../../infra/broadcast.ts';
import type { ProviderKeys } from '../../infra/llm.ts';
import { parseJsonBody } from '../../infra/parse-body.ts';
import type { SessionStore } from '../../infra/session-store.ts';
import type { SettingsStore } from '../settings/settings.store.ts';
import { type SessionDeps, startSession } from './sessions.runner.ts';

export interface SessionsRouteDeps {
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
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
  conversationId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Shared conversation ID for multi-turn chat. Sessions with the same ID share memory.',
    ),
});

const ApproveBody = z.object({
  decision: z.enum(['approve', 'reject']),
  editedPlan: z.unknown().optional(),
});

export function createSessionsRoutes(deps: SessionsRouteDeps) {
  const { sessionStore, settingsStore, approvalStore, getProviderKeys } = deps;
  const routes = new Hono();

  const activeSessions = new Map<string, { broadcast: RunBroadcast; abort: AbortController }>();
  const inflight = new Set<string>();

  const sessionDeps: SessionDeps = {
    sessionStore,
    settingsStore,
    approvalStore,
  };

  routes.post('/', async (c) => {
    const result = await parseJsonBody(c, CreateSessionBody);
    if (!result.ok) {
      return result.response;
    }

    const { toolId, question, settings, resumeSessionId, conversationId } = result.data;
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
          ...(conversationId !== undefined ? { conversationId } : {}),
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
          for await (const ev of handle.events) {
            broadcast.push(ev);
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
      const lastEventId = c.req.header('Last-Event-ID');
      const fromSeq = lastEventId ? Number.parseInt(lastEventId, 10) + 1 : 0;
      const sub = active.broadcast.subscribe(Number.isNaN(fromSeq) ? 0 : fromSeq);
      return streamSSE(c, async (stream) => {
        for await (const { seq, event } of sub) {
          await stream.writeSSE({
            event: 'event',
            id: String(seq),
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
    const lastEventId = c.req.header('Last-Event-ID');
    const replayFrom = lastEventId ? Number.parseInt(lastEventId, 10) + 1 : 0;
    return streamSSE(c, async (stream) => {
      let seq = 0;
      for (const stored of storedEvents) {
        if (seq >= (Number.isNaN(replayFrom) ? 0 : replayFrom)) {
          await stream.writeSSE({
            event: 'event',
            id: String(seq),
            data: JSON.stringify({
              type: stored.type,
              ts: stored.ts,
              runId: sessionId,
              ...stored.payload,
            }),
          });
        }
        seq++;
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

  routes.get('/conversations/list', (c) => {
    const toolId = c.req.query('toolId');
    const conversations = sessionStore.listConversations(toolId);
    return c.json({ conversations });
  });

  routes.get('/conversations/:conversationId/messages', (c) => {
    const conversationId = c.req.param('conversationId');
    const sessions = sessionStore.getSessionsByConversation(conversationId);
    const messages: { role: 'user' | 'assistant'; content: string; sessionId: string }[] = [];

    for (const session of sessions) {
      messages.push({ role: 'user', content: session.question, sessionId: session.id });

      const events = sessionStore.getEvents(session.id);
      let assistantText = '';
      for (const ev of events) {
        if (ev.type === 'writer' && typeof ev.payload.delta === 'string') {
          assistantText += ev.payload.delta;
        }
        if (ev.type === 'llm' && ev.payload.phase === 'response') {
          const msgs = ev.payload.messages;
          if (Array.isArray(msgs)) {
            for (let i = msgs.length - 1; i >= 0; i--) {
              const m = msgs[i] as { role?: string; content?: string };
              if (m?.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
                assistantText = m.content;
                break;
              }
            }
          }
        }
      }
      if (assistantText.trim()) {
        messages.push({ role: 'assistant', content: assistantText, sessionId: session.id });
      }
    }

    return c.json({ conversationId, messages });
  });

  routes.delete('/conversations/:conversationId', (c) => {
    const conversationId = c.req.param('conversationId');
    const active = sessionStore.getSessionsByConversation(conversationId);
    for (const s of active) {
      const entry = activeSessions.get(s.id);
      if (entry) {
        entry.abort.abort();
        entry.broadcast.done();
        activeSessions.delete(s.id);
      }
    }
    sessionStore.deleteConversation(conversationId);
    return c.json({ ok: true });
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
        const active = activeSessions.get(sessionId);
        if (active) {
          active.abort.abort();
        }
      }

      const decisionPayload: ApprovalDecision = {
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
