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
import type { ApprovalStore, HitlPlanDecision } from './runs.approval.ts';
import type { HitlSessionStore } from './runs.hitl.ts';
import { type RunDeps, startRun } from './runs.runner.ts';
import type { RunStore } from './runs.store.ts';

export interface RunsRouteDeps {
  runStore: RunStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
  getProviderKeys: () => ProviderKeys;
}

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

const ApproveBody = z.object({
  decision: z.enum(['approve', 'reject']),
  editedPlan: z.unknown().optional(),
});

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

export function createRunsRoutes(deps: RunsRouteDeps) {
  const { runStore, settingsStore, approvalStore, hitlSessionStore, getProviderKeys } = deps;
  const routes = new Hono();

  const activeRuns = new Map<string, { broadcast: RunBroadcast; abort: AbortController }>();

  const runDeps: RunDeps = { runStore, settingsStore, approvalStore, hitlSessionStore };

  // ── CRUD + streaming ──────────────────────────────────────────────

  routes.post('/', async (c) => {
    const result = await parseJsonBody(c, CreateRunBody);
    if (!result.ok) {
      return result.response;
    }

    const { toolId, question, settings, resumeRunId } = result.data;
    const runId = crypto.randomUUID();
    const ac = new AbortController();

    try {
      const handle = startRun(
        {
          runId,
          toolId,
          question,
          settings,
          ...(resumeRunId !== undefined ? { resumeRunId } : {}),
          signal: ac.signal,
          abortController: ac,
          providerKeys: getProviderKeys(),
        },
        runDeps,
      );

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

    const runs = runStore.listRuns({
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      ...(limit ? { limit } : {}),
    });

    return c.json({ runs });
  });

  routes.get('/:id', (c) => {
    const run = runStore.getRun(c.req.param('id'));
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

    const run = runStore.getRun(runId);
    if (!run) {
      return c.json({ error: 'Run not found' }, 404);
    }

    const storedEvents = runStore.getEvents(runId);
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

  routes.delete('/:id', (c) => {
    const runId = c.req.param('id');
    const active = activeRuns.get(runId);
    if (active) {
      active.abort.abort();
      active.broadcast.done();
      activeRuns.delete(runId);
    }
    runStore.deleteRun(runId);
    return c.json({ ok: true });
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

  // ── Plan approval ─────────────────────────────────────────────────

  routes.post('/:id/approve', async (c) => {
    const runId = c.req.param('id');
    const run = runStore.getRun(runId);
    if (!run) {
      return c.json({ error: 'Run not found' }, 404);
    }

    if (inflight.has(runId)) {
      return c.json({ error: 'Approval already in progress' }, 409);
    }

    const parsed = await parseJsonBody(c, ApproveBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    if (!approvalStore.hasPending(runId)) {
      return c.json({ error: 'No pending approval' }, 404);
    }

    inflight.add(runId);
    try {
      if (parsed.data.decision === 'approve') {
        const session = hitlSessionStore.get(runId);
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
      runStore.appendEvent(runId, resolvedEvent);

      if (parsed.data.decision === 'reject') {
        const session = hitlSessionStore.get(runId);
        if (session) {
          session.abortController.abort();
        }
      }

      const decisionPayload: HitlPlanDecision = {
        decision: parsed.data.decision,
        ...(parsed.data.editedPlan !== undefined ? { editedPlan: parsed.data.editedPlan } : {}),
      };

      if (!approvalStore.resolve(runId, decisionPayload)) {
        return c.json({ error: 'No pending approval' }, 404);
      }

      return c.json({ ok: true });
    } finally {
      inflight.delete(runId);
    }
  });

  return routes;
}
