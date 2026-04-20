import { Hono } from 'hono';
import { DEFAULT_GLOBAL_SETTINGS } from '../../shared/settings.ts';

export const settingsRoutes = new Hono();

settingsRoutes.get('/', (c) => {
  return c.json({ global: DEFAULT_GLOBAL_SETTINGS, tools: {} });
});
