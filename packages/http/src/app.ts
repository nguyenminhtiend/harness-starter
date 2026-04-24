import { Hono } from 'hono';
import type { HttpAppDeps } from './deps.ts';
import { bodyLimit } from './middleware/body-limit.ts';
import { localCors } from './middleware/cors.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { requestId } from './middleware/request-id.ts';
import { capabilitiesRoutes } from './routes/capabilities.routes.ts';
import { healthRoutes } from './routes/health.routes.ts';
import { runsRoutes } from './routes/runs.routes.ts';

export interface HttpAppConfig {
  readonly basePath?: string;
}

export function createHttpApp(deps: HttpAppDeps, config?: HttpAppConfig): Hono {
  const base = config?.basePath ?? '';
  const app = new Hono().basePath(base);

  app.use('*', localCors());
  app.use('*', requestId());
  app.use('*', bodyLimit());
  app.onError(errorHandler());

  app.route('/health', healthRoutes());
  app.route('/capabilities', capabilitiesRoutes(deps));
  app.route('/runs', runsRoutes(deps));

  return app;
}
