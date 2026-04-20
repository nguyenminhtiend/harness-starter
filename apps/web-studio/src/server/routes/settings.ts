import { Hono } from 'hono';
import { z } from 'zod';
import type { Persistence } from '../persistence.ts';
import { applySettingsPut, buildSettingsGetResponse } from '../settings-merge.ts';

const SettingsUpdateBody = z.object({
  scope: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
});

export function createSettingsRoutes(persistence: Persistence) {
  const routes = new Hono();

  routes.get('/', (c) => {
    return c.json(buildSettingsGetResponse(persistence));
  });

  routes.put('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const parsed = SettingsUpdateBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const result = applySettingsPut(persistence, parsed.data.scope, parsed.data.settings);
    if (!result.ok) {
      return c.json({ error: result.message }, result.status);
    }

    return c.json({ ok: true });
  });

  return routes;
}
