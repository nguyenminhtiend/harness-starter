import { getCapability, listCapabilities } from '@harness/core';
import { Hono } from 'hono';
import { openApi } from 'hono-zod-openapi';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';

function schemaToJson(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema);
  return rest;
}

const CapabilitySummary = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  supportsApproval: z.boolean(),
});

const CapabilityDetail = CapabilitySummary.extend({
  inputSchema: z.record(z.string(), z.unknown()),
  settingsSchema: z.record(z.string(), z.unknown()),
});

export function capabilitiesRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get(
    '/',
    openApi({
      tags: ['capabilities'],
      responses: { 200: z.array(CapabilitySummary) },
    }),
    (c) => {
      const caps = listCapabilities(deps);
      return c.json(
        caps.map((cap) => ({
          id: cap.id,
          title: cap.title,
          description: cap.description,
          supportsApproval: cap.supportsApproval ?? false,
        })),
      );
    },
  );

  app.get(
    '/:id',
    openApi({
      tags: ['capabilities'],
      responses: { 200: CapabilityDetail },
    }),
    (c) => {
      const cap = getCapability(deps, c.req.param('id'));
      return c.json({
        id: cap.id,
        title: cap.title,
        description: cap.description,
        supportsApproval: cap.supportsApproval ?? false,
        inputSchema: schemaToJson(cap.inputSchema),
        settingsSchema: schemaToJson(cap.settingsSchema),
      });
    },
  );

  return app;
}
