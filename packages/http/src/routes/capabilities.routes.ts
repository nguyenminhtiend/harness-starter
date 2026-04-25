import { getCapability, listCapabilities } from '@harness/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';

function schemaToJson(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema);
  return rest;
}

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
      inputSchema: schemaToJson(cap.inputSchema),
      settingsSchema: schemaToJson(cap.settingsSchema),
    });
  });

  return app;
}
