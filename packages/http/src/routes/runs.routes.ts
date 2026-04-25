import { cancelRun, startRun, streamRunEvents } from '@harness/core';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { HttpAppDeps } from '../deps.ts';
import { ListRunsQuery, StartRunBody } from './runs.schemas.ts';

export function runsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get('/', zValidator('query', ListRunsQuery), async (c) => {
    const { status, capabilityId, limit } = c.req.valid('query');
    const runs = await deps.runStore.list({
      ...(status ? { status } : {}),
      ...(capabilityId ? { capabilityId } : {}),
      ...(limit != null ? { limit } : {}),
    });
    return c.json({ runs });
  });

  app.post('/', zValidator('json', StartRunBody), async (c) => {
    const body = c.req.valid('json');
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
    await deps.eventLog.deleteByRunId(runId);
    await deps.runStore.delete(runId);
    return c.body(null, 204);
  });

  app.get('/:id/events', async (c) => {
    const runId = c.req.param('id');
    const run = await deps.runStore.get(runId);
    if (!run) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
    }

    const lastEventId = c.req.header('last-event-id');
    const parsed = lastEventId ? Number.parseInt(lastEventId, 10) : undefined;
    const fromSeq = parsed !== undefined && Number.isFinite(parsed) ? parsed + 1 : undefined;

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
          } catch (_err) {
            const errorData = `event: error\ndata: ${JSON.stringify({ message: 'Stream interrupted' })}\n\n`;
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
