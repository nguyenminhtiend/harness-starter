import { Hono } from 'hono';
import { z } from 'zod';
import { DEFAULT_GLOBAL_SETTINGS, type GlobalSettings } from '../../shared/settings.ts';
import type { Persistence } from '../persistence.ts';

const SettingsUpdateBody = z.object({
  scope: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
});

export function createSettingsRoutes(persistence: Persistence) {
  const routes = new Hono();

  routes.get('/', (c) => {
    const stored = persistence.getAllSettings();
    const global = (stored.global as GlobalSettings) ?? DEFAULT_GLOBAL_SETTINGS;
    const toolSettings: Record<string, Record<string, unknown>> = {};

    for (const [key, value] of Object.entries(stored)) {
      if (key !== 'global' && key !== 'apiKeys') {
        toolSettings[key] = value as Record<string, unknown>;
      }
    }

    return c.json({ global, tools: toolSettings });
  });

  routes.put('/', async (c) => {
    const body = await c.req.json();
    const parsed = SettingsUpdateBody.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { scope, settings } = parsed.data;

    if (scope === 'global') {
      const existing = (persistence.getSetting<Record<string, unknown>>('global') ?? {
        ...DEFAULT_GLOBAL_SETTINGS,
      }) as Record<string, unknown>;
      persistence.upsertSetting('global', { ...existing, ...settings });
    } else {
      const existing = (persistence.getSetting<Record<string, unknown>>(scope) ?? {}) as Record<
        string,
        unknown
      >;
      persistence.upsertSetting(scope, { ...existing, ...settings });
    }

    return c.json({ ok: true });
  });

  return routes;
}

export const settingsRoutes = new Hono();
settingsRoutes.get('/', (c) => c.json({ global: DEFAULT_GLOBAL_SETTINGS, tools: {} }));
