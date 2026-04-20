import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { Persistence } from '../persistence.ts';
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

export function createRunsRoutes(persistence: Persistence, getApiKey: () => string) {
  const routes = new Hono();

  const activeRuns = new Map<string, { events: AsyncIterable<unknown>; abort: AbortController }>();

  routes.post('/', async (c) => {
    const body = await c.req.json();
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
        persistence,
        apiKey: getApiKey(),
      });

      activeRuns.set(runId, { events: handle.events, abort: ac });

      return c.json({ id: runId });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  routes.get('/', (c) => {
    const status = c.req.query('status');
    const q = c.req.query('q');
    const limitStr = c.req.query('limit');
    const limit = limitStr ? Number(limitStr) : undefined;

    const runs = persistence.listRuns({
      ...(status
        ? { status: status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' }
        : {}),
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
      return streamSSE(c, async (stream) => {
        try {
          for await (const event of active.events) {
            await stream.writeSSE({
              event: 'event',
              data: JSON.stringify(event),
            });
          }
          await stream.writeSSE({ event: 'done', data: '{}' });
        } finally {
          activeRuns.delete(runId);
        }
      });
    }

    // Replay from SQLite for finished runs
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

export const runsRoutes = new Hono();
runsRoutes.get('/', (c) => c.json({ runs: [] }));
