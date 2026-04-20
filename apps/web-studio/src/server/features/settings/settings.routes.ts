import { Hono } from 'hono';
import { z } from 'zod';
import { parseJsonBody } from '../../infra/parse-body.ts';
import { buildSettingsGetResponse } from './settings.reader.ts';
import type { SettingsStore } from './settings.store.ts';
import { applySettingsPut } from './settings.writer.ts';

const SettingsUpdateBody = z.object({
  scope: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
});

export function createSettingsRoutes(settingsStore: SettingsStore) {
  const routes = new Hono();

  routes.get('/', (c) => {
    return c.json(buildSettingsGetResponse(settingsStore));
  });

  routes.put('/', async (c) => {
    const parsed = await parseJsonBody(c, SettingsUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const result = applySettingsPut(settingsStore, parsed.data.scope, parsed.data.settings);
    if (!result.ok) {
      return c.json({ error: result.message }, result.status);
    }

    return c.json({ ok: true });
  });

  return routes;
}
