import { Hono } from 'hono';

export const runsRoutes = new Hono();

runsRoutes.get('/', (c) => {
  return c.json({ runs: [] });
});
