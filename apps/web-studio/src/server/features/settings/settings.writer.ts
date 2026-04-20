import { DEFAULT_GLOBAL_SETTINGS } from '../../../shared/settings.ts';
import { tools as toolRegistry } from '../tools/tools.registry.ts';
import {
  type ApiKeysStore,
  promptStorageKey,
  readApiKeysStore,
  TOOL_PROMPT_FIELD_TO_ROLE,
  TOOL_SECRET_STORAGE,
  writeApiKeysStore,
} from './settings.constants.ts';
import type { SettingsStore } from './settings.store.ts';

export function applySettingsPut(
  store: SettingsStore,
  scope: string,
  settings: Record<string, unknown>,
): { ok: true } | { ok: false; status: 400; message: string } {
  if (scope === 'global') {
    const existing = store.get<Record<string, unknown>>('global') ?? {
      ...DEFAULT_GLOBAL_SETTINGS,
    };
    const next = { ...existing };
    for (const [k, v] of Object.entries(settings)) {
      if (k === 'apiKeys') {
        continue;
      }
      next[k] = v;
    }
    store.upsert('global', next);
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
        store.delete(storageKey);
      } else if (typeof value === 'string') {
        store.upsert(storageKey, value);
      } else {
        return { ok: false, status: 400, message: `Invalid prompt value for ${key}` };
      }
      continue;
    }

    const secretKey = secretMap[key];
    if (secretKey) {
      if (typeof value === 'string') {
        const cur = readApiKeysStore(store);
        const next: ApiKeysStore = { ...cur };
        const row = { ...(next[scope] ?? {}) };
        if (value === '') {
          delete row[secretKey];
        } else {
          row[secretKey] = value;
        }
        if (Object.keys(row).length === 0) {
          delete next[scope];
        } else {
          next[scope] = row;
        }
        writeApiKeysStore(store, next);
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

  const existing = store.get<Record<string, unknown>>(scope) ?? {};
  const merged: Record<string, unknown> = { ...existing, ...normalPatch };
  for (const field of Object.keys(fieldToRole)) {
    delete merged[field];
  }
  for (const field of Object.keys(secretMap)) {
    delete merged[field];
  }
  store.upsert(scope, merged);
  return { ok: true };
}
