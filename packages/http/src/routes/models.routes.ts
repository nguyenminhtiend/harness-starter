import { Hono } from 'hono';
import { openApi } from 'hono-zod-openapi';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';

const ModelEntry = z.object({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
});

export function modelsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get(
    '/',
    openApi({
      tags: ['models'],
      responses: { 200: z.array(ModelEntry) },
    }),
    (c) => {
      const models = deps.providerResolver.list(deps.providerKeys);
      return c.json(models);
    },
  );

  return app;
}
