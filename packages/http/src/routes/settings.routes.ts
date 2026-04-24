import { getSettings, updateSettings } from '@harness/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';

const UpdateBody = z.object({
  scope: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
});

export function settingsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const scope = c.req.query('scope') ?? 'global';
    const result = await getSettings(deps, scope);
    return c.json(result);
  });

  app.put('/', async (c) => {
    const body = UpdateBody.parse(await c.req.json());
    await updateSettings(deps, body.scope, body.settings);
    const updated = await getSettings(deps, body.scope);
    return c.json(updated);
  });

  return app;
}
