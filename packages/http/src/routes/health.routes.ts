import { Hono } from 'hono';
import { openApi } from 'hono-zod-openapi';
import { z } from 'zod';

export function healthRoutes(): Hono {
  const app = new Hono();

  app.get(
    '/',
    openApi({
      tags: ['system'],
      responses: { 200: z.object({ status: z.string() }) },
    }),
    (c) => c.json({ status: 'ok' }),
  );

  return app;
}
