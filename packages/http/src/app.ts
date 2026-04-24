import { Hono } from 'hono';
import type { HttpAppDeps } from './deps.ts';
import { bodyLimit } from './middleware/body-limit.ts';
import { localCors } from './middleware/cors.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { requestId } from './middleware/request-id.ts';

export interface HttpAppConfig {
  readonly basePath?: string;
}

export function createHttpApp(_deps: HttpAppDeps, config?: HttpAppConfig): Hono {
  const base = config?.basePath ?? '';
  const app = new Hono().basePath(base);

  app.use('*', localCors());
  app.use('*', requestId());
  app.use('*', bodyLimit());
  app.onError(errorHandler());

  app.get('/health', (c) => c.json({ status: 'ok' }));

  return app;
}
