import { Hono } from 'hono';
import { z } from 'zod';
import type { Persistence } from '../persistence.ts';
import { buildSettingsGetResponse } from '../settings-read.ts';
import { applySettingsPut } from '../settings-write.ts';
import { parseJsonBody } from './parse-body.ts';

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
    const parsed = await parseJsonBody(c, SettingsUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = applySettingsPut(persistence, parsed.data.scope, parsed.data.settings);
    if (!result.ok) {
      return c.json({ error: result.message }, result.status);
    }

    return c.json({ ok: true });
  });

  return routes;
}
