import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { HitlSessionStore } from '../active-hitl-sessions.ts';
import type { ApprovalStore } from '../approval.ts';
import type { Persistence } from '../persistence.ts';
import { createRunBroadcast, type RunBroadcast } from '../run-broadcast.ts';
import { startRun } from '../runner.ts';

const CreateRunBody = z.object({
  toolId: z.string().min(1),
  question: z.string().min(1),
  settings: z.record(z.string(), z.unknown()).default({}),
  resumeRunId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Reserved for future checkpoint resume. When implemented, this will load graph state from the referenced run. Currently accepted but ignored.',
    ),
});

export function createRunsRoutes(
  persistence: Persistence,
  getApiKey: () => string,
  approvalStore: ApprovalStore,
  hitlSessionStore: HitlSessionStore,
) {
  const routes = new Hono();

  const activeRuns = new Map<string, { broadcast: RunBroadcast; abort: AbortController }>();

  routes.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const parsed = CreateRunBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { toolId, question, settings, resumeRunId } = parsed.data;
    const runId = crypto.randomUUID();
    const ac = new AbortController();

    try {
      const handle = startRun({
        runId,
        toolId,
        question,
        settings,
        ...(resumeRunId !== undefined ? { resumeRunId } : {}),
        signal: ac.signal,
        abortController: ac,
        persistence,
        apiKey: getApiKey(),
        approvalStore,
        hitlSessionStore,
      });

      const broadcast = createRunBroadcast();
      activeRuns.set(runId, { broadcast, abort: ac });

      void (async () => {
        try {
          for await (const event of handle.events) {
            broadcast.push(event);
          }
        } finally {
          broadcast.done();
          activeRuns.delete(runId);
        }
      })();

      return c.json({ id: runId });
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

    const runs = persistence.listRuns({
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      ...(limit ? { limit } : {}),
    });

    return c.json({ runs });
  });

  routes.get('/:id', (c) => {
    const run = persistence.getRun(c.req.param('id'));
    if (!run) {
      return c.json({ error: 'Run not found' }, 404);
    }
    return c.json(run);
  });

  routes.get('/:id/events', (c) => {
    const runId = c.req.param('id');
    const active = activeRuns.get(runId);

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

    const run = persistence.getRun(runId);
    if (!run) {
      return c.json({ error: 'Run not found' }, 404);
    }

    const storedEvents = persistence.getEvents(runId);
    return streamSSE(c, async (stream) => {
      for (const stored of storedEvents) {
        await stream.writeSSE({
          event: 'event',
          data: JSON.stringify({
            type: stored.type,
            ts: stored.ts,
            runId,
            ...stored.payload,
          }),
        });
      }
      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  });

  routes.post('/:id/cancel', (c) => {
    const runId = c.req.param('id');
    const active = activeRuns.get(runId);
    if (active) {
      active.abort.abort();
      return c.json({ cancelled: true });
    }
    return c.json({ error: 'Run not found or already finished' }, 404);
  });

  return routes;
}
