import { Hono } from 'hono';
import { loadConfig, type ProviderKeys } from './config.ts';
import { type ApprovalStore, createApprovalStore } from './features/runs/runs.approval.ts';
import { createHitlSessionStore, type HitlSessionStore } from './features/runs/runs.hitl.ts';
import { createRunsRoutes } from './features/runs/runs.routes.ts';
import type { RunStore } from './features/runs/runs.store.ts';
import { createRunStore } from './features/runs/runs.store.ts';
import { createSettingsRoutes } from './features/settings/settings.routes.ts';
import { createSettingsStore, type SettingsStore } from './features/settings/settings.store.ts';
import { createToolsRoutes } from './features/tools/tools.routes.ts';
import { createDatabase } from './infra/db.ts';
import { localCors } from './middleware/cors.ts';

export interface AppDeps {
  runStore: RunStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  hitlSessionStore: HitlSessionStore;
  getProviderKeys: () => ProviderKeys;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use('/api/*', localCors());

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.route(
    '/api/runs',
    createRunsRoutes({
      runStore: deps.runStore,
      settingsStore: deps.settingsStore,
      approvalStore: deps.approvalStore,
      hitlSessionStore: deps.hitlSessionStore,
      getProviderKeys: deps.getProviderKeys,
    }),
  );
  app.route('/api/tools', createToolsRoutes());
  app.route('/api/settings', createSettingsRoutes(deps.settingsStore));

  return app;
}

if (import.meta.main) {
  const config = loadConfig();
  const db = createDatabase(config.DATA_DIR);

  const providers = Object.keys(config.providerKeys).join(', ') || 'none';
  console.log(`[server] providers: ${providers}`);

  const app = createApp({
    runStore: createRunStore(db),
    settingsStore: createSettingsStore(db),
    getProviderKeys: () => config.providerKeys,
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
