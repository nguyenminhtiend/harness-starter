import { Hono } from 'hono';
import { loadConfig } from './config.ts';
import { createSessionsRoutes } from './features/sessions/sessions.routes.ts';
import { createSettingsRoutes } from './features/settings/settings.routes.ts';
import { createSettingsStore, type SettingsStore } from './features/settings/settings.store.ts';
import { createToolsRoutes } from './features/tools/tools.routes.ts';
import type { ApprovalStore } from './infra/approval.ts';
import { createApprovalStore } from './infra/approval.ts';
import { createDatabase } from './infra/db.ts';
import type { ProviderKeys } from './infra/llm.ts';
import { listAvailableModels } from './infra/llm.ts';
import type { SessionStore } from './infra/session-store.ts';
import { createSessionStore } from './infra/session-store.ts';
import { bodyLimit } from './middleware/body-limit.ts';
import { localCors } from './middleware/cors.ts';

export interface AppDeps {
  sessionStore: SessionStore;
  settingsStore: SettingsStore;
  approvalStore: ApprovalStore;
  getProviderKeys: () => ProviderKeys;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use('/api/*', localCors());
  app.use('/api/*', bodyLimit());

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.get('/api/models', (c) => {
    const keys = deps.getProviderKeys();
    const models = listAvailableModels(keys);
    return c.json({ models });
  });

  app.route(
    '/api/sessions',
    createSessionsRoutes({
      sessionStore: deps.sessionStore,
      settingsStore: deps.settingsStore,
      approvalStore: deps.approvalStore,
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
    sessionStore: createSessionStore(db),
    settingsStore: createSettingsStore(db),
    getProviderKeys: () => config.providerKeys,
    approvalStore: createApprovalStore(),
  });

  console.log(`[server] listening on http://${config.HOST}:${config.PORT}`);
  Bun.serve({
    fetch: app.fetch,
    hostname: config.HOST,
    port: config.PORT,
    idleTimeout: 255,
  });
}
