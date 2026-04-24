import { Hono } from 'hono';
import type { HttpAppDeps } from '../deps.ts';

export function modelsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const models = deps.providerResolver.list(deps.providerKeys);
    return c.json(models);
  });

  return app;
}
