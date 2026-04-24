import { approveRun } from '@harness/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';

const ApproveBody = z.object({
  approvalId: z.string().min(1),
  editedPlan: z.unknown().optional(),
});

const RejectBody = z.object({
  approvalId: z.string().min(1),
  reason: z.string().optional(),
});

export function approvalsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.post('/:id/approve', async (c) => {
    const runId = c.req.param('id');
    const body = ApproveBody.parse(await c.req.json());
    await approveRun(deps, runId, body.approvalId, {
      kind: 'approve',
      ...(body.editedPlan !== undefined ? { editedPlan: body.editedPlan } : {}),
    });
    return c.json({ ok: true });
  });

  app.post('/:id/reject', async (c) => {
    const runId = c.req.param('id');
    const body = RejectBody.parse(await c.req.json());
    await approveRun(deps, runId, body.approvalId, {
      kind: 'reject',
      ...(body.reason ? { reason: body.reason } : {}),
    });
    return c.json({ ok: true });
  });

  return app;
}
