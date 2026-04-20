import { DEFAULT_GLOBAL_SETTINGS } from '../shared/settings.ts';
import type { Persistence } from './persistence.ts';
import {
  type ApiKeysStore,
  promptStorageKey,
  readApiKeysStore,
  TOOL_PROMPT_FIELD_TO_ROLE,
  TOOL_SECRET_STORAGE,
  writeApiKeysStore,
} from './settings-constants.ts';
import { tools as toolRegistry } from './tools/registry.ts';

export function applySettingsPut(
  persistence: Persistence,
  scope: string,
  settings: Record<string, unknown>,
): { ok: true } | { ok: false; status: 400; message: string } {
  if (scope === 'global') {
    const existing = persistence.getSetting<Record<string, unknown>>('global') ?? {
      ...DEFAULT_GLOBAL_SETTINGS,
    };
    const next = { ...existing };
    for (const [k, v] of Object.entries(settings)) {
      if (k === 'apiKeys') {
        continue;
      }
      next[k] = v;
    }
    persistence.upsertSetting('global', next);
    return { ok: true };
  }

  if (!toolRegistry[scope]) {
    return { ok: false, status: 400, message: `Unknown settings scope: ${scope}` };
  }

  const fieldToRole = TOOL_PROMPT_FIELD_TO_ROLE[scope] ?? {};
  const secretMap = TOOL_SECRET_STORAGE[scope] ?? {};
  const normalPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings)) {
    const role = fieldToRole[key];
    if (role) {
      const storageKey = promptStorageKey(scope, role);
      if (value === undefined || value === null || value === '') {
        persistence.deleteSetting(storageKey);
      } else if (typeof value === 'string') {
        persistence.upsertSetting(storageKey, value);
      } else {
        return { ok: false, status: 400, message: `Invalid prompt value for ${key}` };
      }
      continue;
    }

    const storageKey = secretMap[key];
    if (storageKey) {
      if (typeof value === 'string') {
        const cur = readApiKeysStore(persistence);
        const next: ApiKeysStore = { ...cur };
        const row = { ...(next[scope] ?? {}) };
        if (value === '') {
          delete row[storageKey];
        } else {
          row[storageKey] = value;
        }
        if (Object.keys(row).length === 0) {
          delete next[scope];
        } else {
          next[scope] = row;
        }
        writeApiKeysStore(persistence, next);
      } else if (
        value &&
        typeof value === 'object' &&
        'set' in (value as Record<string, unknown>)
      ) {
        // ignore masked client payloads
      } else {
        return { ok: false, status: 400, message: `Invalid API key value for ${key}` };
      }
      continue;
    }

    normalPatch[key] = value;
  }

  const existing = persistence.getSetting<Record<string, unknown>>(scope) ?? {};
  const merged: Record<string, unknown> = { ...existing, ...normalPatch };
  for (const field of Object.keys(fieldToRole)) {
    delete merged[field];
  }
  for (const field of Object.keys(secretMap)) {
    delete merged[field];
  }
  persistence.upsertSetting(scope, merged);
  return { ok: true };
}
