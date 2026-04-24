import { listCapabilities, updateSettings } from '@harness/core';
import { Hono } from 'hono';
import { z } from 'zod';
import type { HttpAppDeps } from '../deps.ts';

const GLOBAL_DEFAULTS = {
  defaultModel: '',
  budgetUsd: 10,
  budgetTokens: 100_000,
  concurrency: 1,
};

const UpdateBody = z.object({
  scope: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
});

async function buildSettingsResponse(deps: HttpAppDeps) {
  const globalRaw = await deps.settingsStore.getAll('global');
  const global = { ...GLOBAL_DEFAULTS, ...globalRaw };

  const capabilities: Record<
    string,
    { values: Record<string, unknown>; inheritedFromGlobal: Record<string, boolean> }
  > = {};

  for (const cap of listCapabilities(deps)) {
    const scoped = await deps.settingsStore.getAll(cap.id);
    const merged = { ...global, ...scoped };
    const inheritedFromGlobal: Record<string, boolean> = {};
    for (const key of Object.keys(merged)) {
      inheritedFromGlobal[key] = !(key in scoped);
    }
    capabilities[cap.id] = { values: merged, inheritedFromGlobal };
  }

  return { global, capabilities };
}

export function settingsRoutes(deps: HttpAppDeps): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const result = await buildSettingsResponse(deps);
    return c.json(result);
  });

  app.put('/', async (c) => {
    const body = UpdateBody.parse(await c.req.json());
    await updateSettings(deps, body.scope, body.settings);
    const updated = await buildSettingsResponse(deps);
    return c.json(updated);
  });

  return app;
}
