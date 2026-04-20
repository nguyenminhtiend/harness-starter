import { Hono } from 'hono';

export const toolsRoutes = new Hono();

toolsRoutes.get('/', (c) => {
  return c.json({ tools: [] });
});
