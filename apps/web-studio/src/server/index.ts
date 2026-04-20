import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createHitlSessionStore, type HitlSessionStore } from './active-hitl-sessions.ts';
import { type ApprovalStore, createApprovalStore } from './approval.ts';
import { loadConfig } from './config.ts';
import { createPersistence, type Persistence } from './persistence.ts';
import { createApproveRoute } from './routes/approve.ts';
import { createRunsRoutes } from './routes/runs.ts';
import { createSettingsRoutes } from './routes/settings.ts';
import { toolsRoutes } from './routes/tools.ts';

export interface AppDeps {
  persistence: Persistence;
  getApiKey: () => string;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        if (!origin) {
          return origin;
        }
        if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
          return origin;
        }
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
          return origin;
        }
        return undefined;
      },
    }),
  );

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.route(
    '/api/runs',
    createRunsRoutes(deps.persistence, deps.getApiKey, deps.approvalStore, deps.hitlSessionStore),
  );
  app.route(
    '/api/runs',
    createApproveRoute(deps.persistence, {
      hasPendingApproval: (runId) => deps.approvalStore.hasPending(runId),
      resolveApproval: (runId, decision) => deps.approvalStore.resolve(runId, decision),
      getHitlSession: (runId) => deps.hitlSessionStore.get(runId),
    }),
  );
  app.route('/api/tools', toolsRoutes);
  app.route('/api/settings', createSettingsRoutes(deps.persistence));

  return app;
}

if (import.meta.main) {
  const config = loadConfig();
  const persistence = createPersistence(config.DATA_DIR);

  const getApiKey = () => process.env.OPENROUTER_API_KEY ?? '';

  const app = createApp({
    persistence,
    getApiKey,
    approvalStore: createApprovalStore(),
    hitlSessionStore: createHitlSessionStore(),
  });

  console.log(`[server] listening on http://${config.HOST}:${config.PORT}`);
  Bun.serve({
    fetch: app.fetch,
    hostname: config.HOST,
    port: config.PORT,
  });
}
