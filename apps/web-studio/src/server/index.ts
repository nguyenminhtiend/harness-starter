import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { approvalRouteDeps } from './approval.ts';
import { loadConfig } from './config.ts';
import { createPersistence, type Persistence } from './persistence.ts';
import { createApproveRoute } from './routes/approve.ts';
import { createRunsRoutes } from './routes/runs.ts';
import { createSettingsRoutes } from './routes/settings.ts';
import { toolsRoutes } from './routes/tools.ts';

export interface AppDeps {
  persistence: Persistence;
  getApiKey: () => string;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use('/api/*', cors());

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.route('/api/runs', createRunsRoutes(deps.persistence, deps.getApiKey));
  app.route('/api/runs', createApproveRoute(deps.persistence, approvalRouteDeps));
  app.route('/api/tools', toolsRoutes);
  app.route('/api/settings', createSettingsRoutes(deps.persistence));

  return app;
}

if (import.meta.main) {
  const config = loadConfig();
  const persistence = createPersistence(config.DATA_DIR);

  const getApiKey = () => process.env.OPENROUTER_API_KEY ?? '';

  const app = createApp({ persistence, getApiKey });

  console.log(`[server] listening on http://${config.HOST}:${config.PORT}`);
  Bun.serve({
    fetch: app.fetch,
    hostname: config.HOST,
    port: config.PORT,
  });
}
