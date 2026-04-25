import { Hono } from 'hono';
import type { HttpAppDeps } from './deps.ts';
import { bodyLimit } from './middleware/body-limit.ts';
import { localCors } from './middleware/cors.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { accessLogger } from './middleware/logger.ts';
import { requestId } from './middleware/request-id.ts';
import { buildOpenApiSpec, getScalarHtml } from './openapi.ts';
import { capabilitiesRoutes } from './routes/capabilities.routes.ts';
import { conversationsRoutes } from './routes/conversations.routes.ts';
import { healthRoutes } from './routes/health.routes.ts';
import { modelsRoutes } from './routes/models.routes.ts';
import { runsRoutes } from './routes/runs.routes.ts';
import { settingsRoutes } from './routes/settings.routes.ts';

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

  const spec = buildOpenApiSpec();
  app.get('/openapi.json', (c) => c.json(spec));
  app.get('/docs', (c) => c.html(getScalarHtml()));

  app.route('/health', healthRoutes());
  app.route('/capabilities', capabilitiesRoutes(deps));
  app.route('/runs', runsRoutes(deps));
  app.route('/settings', settingsRoutes(deps));
  app.route('/conversations', conversationsRoutes(deps));
  app.route('/models', modelsRoutes(deps));

  return app;
}
