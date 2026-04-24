import type { RunStatus } from '@harness/core';
import { cancelRun, startRun, streamRunEvents } from '@harness/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';

const VALID_STATUSES = new Set<string>([
  'pending',
  'running',
  'suspended',
  'completed',
  'failed',
  'cancelled',
]);

const StartRunBody = z.object({
  capabilityId: z.string().min(1),
  input: z.unknown(),
  settings: z.unknown().optional(),
  conversationId: z.string().optional(),
});

export function runsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const rawStatus = c.req.query('status');
    const status =
      rawStatus && VALID_STATUSES.has(rawStatus) ? (rawStatus as RunStatus) : undefined;
    const capabilityId = c.req.query('capabilityId');
    const limitStr = c.req.query('limit');
    const limit = limitStr ? Number.parseInt(limitStr, 10) : undefined;
    const runs = await deps.runStore.list({
      ...(status ? { status } : {}),
      ...(capabilityId ? { capabilityId } : {}),
      ...(limit ? { limit } : {}),
    });
    return c.json({ runs });
  });

  app.post('/', async (c) => {
    const body = StartRunBody.parse(await c.req.json());
    const abortController = new AbortController();
    const result = await startRun(deps, body, abortController.signal);
    deps.runAbortControllers.set(result.runId, abortController);
    return c.json(result, 201);
  });

  app.get('/:id', async (c) => {
    const run = await deps.runStore.get(c.req.param('id'));
    if (!run) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
    }
    return c.json(run);
  });

  app.post('/:id/cancel', async (c) => {
    const runId = c.req.param('id');
    const controller = deps.runAbortControllers.get(runId);
    if (!controller) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'Run not found or already finished' } },
        404,
      );
    }
    await cancelRun(deps, runId, controller);
    deps.runAbortControllers.delete(runId);
    return c.json({ ok: true });
  });

  app.delete('/:id', async (c) => {
    const runId = c.req.param('id');
    const controller = deps.runAbortControllers.get(runId);
    if (controller) {
      controller.abort();
      deps.runAbortControllers.delete(runId);
    }
    await deps.runStore.delete(runId);
    return c.body(null, 204);
  });

  app.get('/:id/events', async (c) => {
    const runId = c.req.param('id');
    const lastEventId = c.req.header('last-event-id');
    const fromSeq = lastEventId ? Number.parseInt(lastEventId, 10) + 1 : undefined;

    const stream = streamRunEvents(deps, runId, fromSeq);

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of stream) {
              const data = `event: session\nid: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            const errorData = `event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
          } finally {
            controller.close();
          }
        },
      }),
      {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      },
    );
  });

  return app;
}
