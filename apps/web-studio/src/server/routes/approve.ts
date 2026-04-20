import type { Checkpointer } from '@harness/agent';
import { Hono } from 'hono';
import { z } from 'zod';
import type { UIEvent } from '../../shared/events.ts';
import type { HitlRunSession } from '../active-hitl-sessions.ts';
import type { HitlPlanDecision } from '../approval.ts';
import type { Persistence } from '../persistence.ts';
import { ResearchPlan } from '../tools/deep-research/schemas/plan.ts';

const ApproveBody = z.object({
  decision: z.enum(['approve', 'reject']),
  editedPlan: z.unknown().optional(),
});

export interface ApproveRouteResolvers {
  hasPendingApproval: (runId: string) => boolean;
  resolveApproval: (runId: string, decision: HitlPlanDecision) => boolean;
  getHitlSession: (runId: string) => HitlRunSession | undefined;
}

async function applyApproveToCheckpoint(
  checkpointer: Checkpointer,
  runId: string,
  editedPlan: unknown | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const saved = await checkpointer.load(runId);
  if (!saved?.graphState) {
    return { ok: false, error: 'No checkpoint for run' };
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
  await checkpointer.save(runId, saved);
  return { ok: true };
}

const inflight = new Set<string>();

export function createApproveRoute(persistence: Persistence, resolvers: ApproveRouteResolvers) {
  const routes = new Hono();

  routes.post('/:id/approve', async (c) => {
    const runId = c.req.param('id');
    const run = persistence.getRun(runId);
    if (!run) {
      return c.json({ error: 'Run not found' }, 404);
    }

    if (inflight.has(runId)) {
      return c.json({ error: 'Approval already in progress' }, 409);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = ApproveBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    if (!resolvers.hasPendingApproval(runId)) {
      return c.json({ error: 'No pending approval' }, 404);
    }

    inflight.add(runId);
    try {
      if (parsed.data.decision === 'approve') {
        const session = resolvers.getHitlSession(runId);
        if (!session) {
          return c.json({ error: 'No active run session' }, 404);
        }
        const applied = await applyApproveToCheckpoint(
          session.checkpointer,
          runId,
          parsed.data.editedPlan,
        );
        if (!applied.ok) {
          return c.json({ error: applied.error }, 400);
        }
      }

      const resolvedEvent: UIEvent = {
        type: 'hitl-resolved',
        ts: Date.now(),
        runId,
        decision: parsed.data.decision,
        ...(parsed.data.decision === 'approve' && parsed.data.editedPlan !== undefined
          ? { editedPlan: parsed.data.editedPlan }
          : {}),
      };
      persistence.appendEvent(runId, resolvedEvent);

      if (parsed.data.decision === 'reject') {
        const session = resolvers.getHitlSession(runId);
        if (session) {
          session.abortController.abort();
        }
      }

      const decisionPayload: HitlPlanDecision = {
        decision: parsed.data.decision,
        ...(parsed.data.editedPlan !== undefined ? { editedPlan: parsed.data.editedPlan } : {}),
      };

      if (!resolvers.resolveApproval(runId, decisionPayload)) {
        return c.json({ error: 'No pending approval' }, 404);
      }

      return c.json({ ok: true });
    } finally {
      inflight.delete(runId);
    }
  });

  return routes;
}
