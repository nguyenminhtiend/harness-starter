import { Hono } from 'hono';
import { z } from 'zod';
import { tools } from '../tools/registry.ts';

export const toolsRoutes = new Hono();

toolsRoutes.get('/', (c) => {
  const entries = Object.values(tools).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    settingsSchema: z.toJSONSchema(t.settingsSchema),
  }));
  return c.json({ tools: entries });
});
