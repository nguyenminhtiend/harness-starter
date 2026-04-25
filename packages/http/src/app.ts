import { Hono } from 'hono';
import { createOpenApiDocument } from 'hono-zod-openapi';
import type { HttpAppDeps } from './deps.ts';
import { bodyLimit } from './middleware/body-limit.ts';
import { localCors } from './middleware/cors.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { accessLogger } from './middleware/logger.ts';
import { requestId } from './middleware/request-id.ts';
import { capabilitiesRoutes } from './routes/capabilities.routes.ts';
import { conversationsRoutes } from './routes/conversations.routes.ts';
import { healthRoutes } from './routes/health.routes.ts';
import { modelsRoutes } from './routes/models.routes.ts';
import { runsRoutes } from './routes/runs.routes.ts';
import { settingsRoutes } from './routes/settings.routes.ts';

const SCALAR_HTML = `<!doctype html>
<html>
<head>
  <title>Harness API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

export interface HttpAppConfig {
  readonly basePath?: string;
}

export function createHttpApp(deps: HttpAppDeps, config?: HttpAppConfig): Hono {
  const base = config?.basePath ?? '';
  const app = new Hono().basePath(base);

  app.use('*', localCors());
  app.use('*', requestId());
  app.use('*', bodyLimit());
  app.use('*', accessLogger(deps.logger));
  app.onError(errorHandler(deps.logger));

  app.route('/health', healthRoutes());
  app.route('/capabilities', capabilitiesRoutes(deps));
  app.route('/runs', runsRoutes(deps));
  app.route('/settings', settingsRoutes(deps));
  app.route('/conversations', conversationsRoutes(deps));
  app.route('/models', modelsRoutes(deps));

  createOpenApiDocument(
    app,
    {
      info: {
        title: 'Harness API',
        version: '0.0.1',
        description: 'Agentic AI platform API — runs, capabilities, conversations, settings.',
      },
    },
    { routeName: '/openapi.json' },
  );

  app.get('/docs', (c) => c.html(SCALAR_HTML));

  return app;
}
