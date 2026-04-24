import { getCapability, listCapabilities } from '@harness/core';
import { Hono } from 'hono';
import type { HttpAppDeps } from '../deps.ts';

function getZodDef(schema: unknown): Record<string, unknown> | null {
  if (schema === null || typeof schema !== 'object') {
    return null;
  }
  const s = schema as Record<string, unknown>;
  if ('_zod' in s) {
    const zod = s._zod;
    if (zod !== null && typeof zod === 'object') {
      const zr = zod as Record<string, unknown>;
      if ('def' in zr) {
        const d = zr.def;
        if (d !== null && typeof d === 'object') {
          return d as Record<string, unknown>;
        }
      }
    }
  }
  if ('def' in s) {
    const d = s.def;
    if (d !== null && typeof d === 'object') {
      return d as Record<string, unknown>;
    }
  }
  return null;
}

function getCheckDef(check: unknown): Record<string, unknown> | null {
  if (check === null || typeof check !== 'object') {
    return null;
  }
  const c = check as Record<string, unknown>;
  if ('_zod' in c) {
    const zod = c._zod;
    if (zod !== null && typeof zod === 'object') {
      const zr = zod as Record<string, unknown>;
      if ('def' in zr) {
        const d = zr.def;
        if (d !== null && typeof d === 'object') {
          return d as Record<string, unknown>;
        }
      }
    }
  }
  if ('def' in c) {
    const d = c.def;
    if (d !== null && typeof d === 'object') {
      return d as Record<string, unknown>;
    }
  }
  return null;
}

function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  const def = getZodDef(schema);
  if (!def) {
    return {};
  }
  const t = def.type;
  if (t === 'object') {
    const shape = def.shape;
    if (shape === null || typeof shape !== 'object') {
      return { type: 'object', properties: {} };
    }
    const sh = shape as Record<string, unknown>;
    const properties: Record<string, unknown> = {};
    for (const key of Object.keys(sh)) {
      const sub = sh[key];
      if (sub !== undefined) {
        properties[key] = zodToJsonSchema(sub);
      }
    }
    return { type: 'object', properties };
  }
  if (t === 'string') {
    const out: Record<string, unknown> = { type: 'string' };
    if (Array.isArray(def.checks)) {
      for (const ch of def.checks) {
        const cd = getCheckDef(ch);
        if (!cd) {
          continue;
        }
        if (cd.check === 'min_length' && typeof cd.minimum === 'number') {
          out.minLength = cd.minimum;
        }
        if (cd.check === 'max_length' && typeof cd.maximum === 'number') {
          out.maxLength = cd.maximum;
        }
      }
    }
    return out;
  }
  if (t === 'number') {
    const out: Record<string, unknown> = { type: 'number' };
    let isInt = false;
    if (Array.isArray(def.checks)) {
      for (const ch of def.checks) {
        const cd = getCheckDef(ch);
        if (!cd) {
          continue;
        }
        if (cd.type === 'number' && cd.check === 'number_format' && cd.format === 'safeint') {
          isInt = true;
        }
        if (cd.check === 'greater_than' && typeof cd.value === 'number') {
          if (cd.inclusive === true) {
            out.minimum = cd.value;
          } else {
            out.exclusiveMinimum = cd.value;
          }
        }
        if (cd.check === 'less_than' && typeof cd.value === 'number') {
          if (cd.inclusive === true) {
            out.maximum = cd.value;
          } else {
            out.exclusiveMaximum = cd.value;
          }
        }
      }
    }
    if (isInt) {
      out.format = 'integer';
    }
    return out;
  }
  if (t === 'boolean') {
    return { type: 'boolean' };
  }
  if (t === 'optional') {
    if ('innerType' in def && def.innerType !== undefined) {
      return zodToJsonSchema(def.innerType);
    }
    return {};
  }
  if (t === 'enum') {
    if (Array.isArray(def.values)) {
      return { type: 'string', enum: [...def.values] as unknown[] };
    }
    if (def.entries !== null && typeof def.entries === 'object') {
      const en = def.entries as Record<string, unknown>;
      return { type: 'string', enum: Object.values(en) };
    }
    return { type: 'string', enum: [] };
  }
  if (t === 'default') {
    const inner =
      'innerType' in def && def.innerType !== undefined ? zodToJsonSchema(def.innerType) : {};
    if ('defaultValue' in def) {
      return { ...inner, default: def.defaultValue };
    }
    return inner;
  }
  return {};
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
      inputSchema: zodToJsonSchema(cap.inputSchema),
      settingsSchema: zodToJsonSchema(cap.settingsSchema),
    });
  });

  return app;
}
