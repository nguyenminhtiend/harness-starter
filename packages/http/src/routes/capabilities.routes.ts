import { getCapability, listCapabilities } from '@harness/core';
import { Hono } from 'hono';
import type { HttpAppDeps } from '../deps.ts';

export function capabilitiesRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const caps = listCapabilities(deps);
    return c.json(
      caps.map((cap) => ({
        id: cap.id,
        title: cap.title,
        description: cap.description,
        supportsApproval: cap.supportsApproval ?? false,
      })),
    );
  });

  app.get('/:id', (c) => {
    const cap = getCapability(deps, c.req.param('id'));
    return c.json({
      id: cap.id,
      title: cap.title,
      description: cap.description,
      supportsApproval: cap.supportsApproval ?? false,
      inputSchema: cap.inputSchema,
      settingsSchema: cap.settingsSchema,
    });
  });

  return app;
}
