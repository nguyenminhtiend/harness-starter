import type { GlobalSettings, ToolSettingsView } from '../../../shared/settings.ts';
import { tools as toolRegistry } from '../tools/tools.registry.ts';
import {
  applyGlobalLayer,
  applyToolPersistenceLayer,
  GLOBAL_TOOL_KEYS,
  readMergedGlobalSettings,
  TOOL_SECRET_STORAGE,
} from './settings.constants.ts';
import type { SettingsStore } from './settings.store.ts';

function maskSecretsForClient(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const k of Object.keys(out)) {
    if (k.endsWith('ApiKey')) {
      const v = out[k];
      const set = typeof v === 'string' && v.length > 0;
      out[k] = { set };
    }
  }
  return out;
}

function inheritedFromGlobalForTool(toolId: string, store: SettingsStore): Record<string, boolean> {
  const storedRow = store.get<Record<string, unknown>>(toolId);
  const inherited: Record<string, boolean> = {};
  for (const key of GLOBAL_TOOL_KEYS) {
    if (!storedRow || typeof storedRow !== 'object') {
      inherited[key] = true;
      continue;
    }
    inherited[key] = !(key in storedRow);
  }
  return inherited;
}

/**
 * Resolve the full settings for a tool through the precedence chain:
 *   defaults → global → tool persistence → secret storage → request overrides
 *
 * Returns the raw runtime values (with real secrets).
 */
export function resolveSettings(
  toolId: string,
  store: SettingsStore,
  requestOverrides?: Record<string, unknown>,
): Record<string, unknown> {
  const toolDef = toolRegistry[toolId];
  if (!toolDef) {
    return { ...(requestOverrides ?? {}) };
  }
  const merged: Record<string, unknown> = {
    ...(toolDef.defaultSettings as Record<string, unknown>),
  };
  const global = readMergedGlobalSettings(store);
  applyGlobalLayer(merged, global);
  applyToolPersistenceLayer(toolId, store, merged);
  if (requestOverrides) {
    Object.assign(merged, requestOverrides);
  }
  return merged;
}

/** Build the full GET /settings response with masked secrets. */
export function buildSettingsGetResponse(store: SettingsStore): {
  global: GlobalSettings;
  tools: Record<string, ToolSettingsView>;
} {
  const global = readMergedGlobalSettings(store);
  const tools: Record<string, ToolSettingsView> = {};

  for (const toolId of Object.keys(toolRegistry)) {
    const resolved = resolveSettings(toolId, store);
    const values = maskSecretsForClient(resolved);
    const secretMap = TOOL_SECRET_STORAGE[toolId];
    if (secretMap) {
      for (const fieldName of Object.keys(secretMap)) {
        const raw = resolved[fieldName];
        values[fieldName] = {
          set: typeof raw === 'string' && raw.length > 0,
        };
      }
    }
    tools[toolId] = {
      values,
      inheritedFromGlobal: inheritedFromGlobalForTool(toolId, store),
    };
  }

  return { global, tools };
}

/**
 * @deprecated Use `resolveSettings(toolId, store, requestSettings)` instead.
 */
export function mergeToolRuntimeSettings(
  toolId: string,
  store: SettingsStore,
  requestSettings: Record<string, unknown>,
): Record<string, unknown> {
  return resolveSettings(toolId, store, requestSettings);
}
