import { approveRun, cancelRun, deleteRun, startRun, streamRunEvents } from '@harness/core';
import { Hono } from 'hono';
import { openApi } from 'hono-zod-openapi';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';
import {
  ApproveBody,
  ErrorResponse,
  ListRunsQuery,
  OkResponse,
  RejectBody,
  StartRunBody,
} from './runs.schemas.ts';

const RunIdResponse = z.object({ runId: z.string() });

export function runsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get(
    '/',
    openApi({
      tags: ['runs'],
      request: { query: ListRunsQuery },
      responses: { 200: z.object({ runs: z.array(z.unknown()) }) },
    }),
    async (c) => {
      const { status, capabilityId, limit } = c.req.valid('query');
      const runs = await deps.runStore.list({
        ...(status ? { status } : {}),
        ...(capabilityId ? { capabilityId } : {}),
        ...(limit != null ? { limit } : {}),
      });
      return c.json({ runs });
    },
  );

  app.post(
    '/',
    openApi({
      tags: ['runs'],
      request: { json: StartRunBody },
      responses: { 201: RunIdResponse, 404: ErrorResponse },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const abortController = new AbortController();
      const result = await startRun(deps, body, abortController.signal);
      deps.executor.registerAbort(result.runId, abortController);
      return c.json(result, 201);
    },
  );

  app.get('/:id', async (c) => {
    const run = await deps.runStore.get(c.req.param('id'));
    if (!run) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
    }
    return c.json(run);
  });

  app.post('/:id/cancel', async (c) => {
    const runId = c.req.param('id');
    await cancelRun(deps, runId);
    return c.json({ ok: true });
  });

  app.delete('/:id', async (c) => {
    const runId = c.req.param('id');
    deps.executor.abort(runId);
    await deleteRun(deps, runId);
    return c.body(null, 204);
  });

  app.post(
    '/:id/approve',
    openApi({
      tags: ['approvals'],
      request: { json: ApproveBody },
      responses: { 200: OkResponse, 404: ErrorResponse, 409: ErrorResponse },
    }),
    async (c) => {
      const runId = c.req.param('id');
      const body = c.req.valid('json');
      await approveRun(deps, runId, body.approvalId, {
        kind: 'approve',
        ...(body.editedPlan !== undefined ? { editedPlan: body.editedPlan } : {}),
      });
      return c.json({ ok: true });
    },
  );

  app.post(
    '/:id/reject',
    openApi({
      tags: ['approvals'],
      request: { json: RejectBody },
      responses: { 200: OkResponse, 404: ErrorResponse, 409: ErrorResponse },
    }),
    async (c) => {
      const runId = c.req.param('id');
      const body = c.req.valid('json');
      await approveRun(deps, runId, body.approvalId, {
        kind: 'reject',
        ...(body.reason ? { reason: body.reason } : {}),
      });
      return c.json({ ok: true });
    },
  );

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
