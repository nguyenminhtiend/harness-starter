import { Hono } from 'hono';
import { loadConfig } from './config.ts';
import { runsRoutes } from './routes/runs.ts';
import { settingsRoutes } from './routes/settings.ts';
import { toolsRoutes } from './routes/tools.ts';

export function createApp() {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.route('/api/runs', runsRoutes);
  app.route('/api/tools', toolsRoutes);
  app.route('/api/settings', settingsRoutes);

  return app;
}

if (import.meta.main) {
  const config = loadConfig();
  const app = createApp();

  console.log(`[server] listening on http://${config.HOST}:${config.PORT}`);
  Bun.serve({
    fetch: app.fetch,
    hostname: config.HOST,
    port: config.PORT,
  });
}
