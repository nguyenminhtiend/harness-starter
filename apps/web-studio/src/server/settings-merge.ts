import {
  DEFAULT_GLOBAL_SETTINGS,
  type GlobalSettings,
  type ToolSettingsView,
} from '../shared/settings.ts';
import type { Persistence } from './persistence.ts';
import { tools as toolRegistry } from './tools/registry.ts';

const GLOBAL_TOOL_KEYS = ['model', 'budgetUsd', 'maxTokens', 'concurrency'] as const;

export const TOOL_PROMPT_FIELDS: Record<string, Record<string, string>> = {
  'deep-research': {
    planner: 'plannerPrompt',
    writer: 'writerPrompt',
    factChecker: 'factCheckerPrompt',
  },
};

const TOOL_PROMPT_FIELD_TO_ROLE: Record<string, Record<string, string>> = (() => {
  const out: Record<string, Record<string, string>> = {};
  for (const [toolId, roles] of Object.entries(TOOL_PROMPT_FIELDS)) {
    const inv: Record<string, string> = {};
    for (const [role, field] of Object.entries(roles)) {
      inv[field] = role;
    }
    out[toolId] = inv;
  }
  return out;
})();

const TOOL_SECRET_STORAGE: Record<string, Record<string, string>> = {
  'deep-research': { braveApiKey: 'brave' },
};

type ApiKeysStore = Record<string, Record<string, string>>;

export function promptStorageKey(toolId: string, role: string): string {
  return `${toolId}.prompts.${role}`;
}

function readMergedGlobalSettings(persistence: Persistence): GlobalSettings {
  const stored = persistence.getSetting<unknown>('global');
  if (!stored || typeof stored !== 'object') {
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }
  const s = stored as Record<string, unknown>;
  return {
    defaultModel:
      typeof s.defaultModel === 'string' ? s.defaultModel : DEFAULT_GLOBAL_SETTINGS.defaultModel,
    budgetUsd:
      typeof s.budgetUsd === 'number' && Number.isFinite(s.budgetUsd)
        ? s.budgetUsd
        : DEFAULT_GLOBAL_SETTINGS.budgetUsd,
    budgetTokens:
      typeof s.budgetTokens === 'number' && Number.isFinite(s.budgetTokens)
        ? s.budgetTokens
        : DEFAULT_GLOBAL_SETTINGS.budgetTokens,
    concurrency:
      typeof s.concurrency === 'number' && Number.isFinite(s.concurrency)
        ? s.concurrency
        : DEFAULT_GLOBAL_SETTINGS.concurrency,
  };
}

function readApiKeysStore(persistence: Persistence): ApiKeysStore {
  const raw = persistence.getSetting<unknown>('apiKeys');
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const out: ApiKeysStore = {};
  for (const [toolId, bucket] of Object.entries(raw as Record<string, unknown>)) {
    if (!bucket || typeof bucket !== 'object') {
      continue;
    }
    const inner: Record<string, string> = {};
    for (const [k, v] of Object.entries(bucket as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) {
        inner[k] = v;
      }
    }
    if (Object.keys(inner).length > 0) {
      out[toolId] = inner;
    }
  }
  return out;
}

function writeApiKeysStore(persistence: Persistence, next: ApiKeysStore): void {
  if (Object.keys(next).length === 0) {
    persistence.deleteSetting('apiKeys');
    return;
  }
  persistence.upsertSetting('apiKeys', next);
}

function applyGlobalLayer(target: Record<string, unknown>, global: GlobalSettings): void {
  target.model = global.defaultModel;
  target.budgetUsd = global.budgetUsd;
  target.maxTokens = global.budgetTokens;
  target.concurrency = global.concurrency;
}

export function mergeToolRuntimeSettings(
  toolId: string,
  persistence: Persistence,
  requestSettings: Record<string, unknown>,
): Record<string, unknown> {
  const toolDef = toolRegistry[toolId];
  if (!toolDef) {
    return { ...requestSettings };
  }
  const merged: Record<string, unknown> = {
    ...(toolDef.defaultSettings as Record<string, unknown>),
  };
  const global = readMergedGlobalSettings(persistence);
  applyGlobalLayer(merged, global);
  applyToolPersistenceLayer(toolId, persistence, merged);
  return { ...merged, ...requestSettings };
}

function applyToolPersistenceLayer(
  toolId: string,
  persistence: Persistence,
  target: Record<string, unknown>,
): void {
  const row = persistence.getSetting<Record<string, unknown>>(toolId);
  if (row && typeof row === 'object') {
    Object.assign(target, row);
  }

  const promptRoles = TOOL_PROMPT_FIELDS[toolId];
  if (promptRoles) {
    for (const [role, field] of Object.entries(promptRoles)) {
      const key = promptStorageKey(toolId, role);
      const v = persistence.getSetting<unknown>(key);
      if (typeof v === 'string') {
        target[field] = v;
      }
    }
  }

  const secretMap = TOOL_SECRET_STORAGE[toolId];
  const apiKeys = readApiKeysStore(persistence)[toolId];
  if (secretMap && apiKeys) {
    for (const [fieldName, storageKey] of Object.entries(secretMap)) {
      const secret = apiKeys[storageKey];
      if (typeof secret === 'string' && secret.length > 0) {
        target[fieldName] = secret;
      }
    }
  }
}

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

function inheritedFromGlobalForTool(
  toolId: string,
  persistence: Persistence,
): Record<string, boolean> {
  const storedRow = persistence.getSetting<Record<string, unknown>>(toolId);
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

export function buildSettingsGetResponse(persistence: Persistence): {
  global: GlobalSettings;
  tools: Record<string, ToolSettingsView>;
} {
  const global = readMergedGlobalSettings(persistence);
  const tools: Record<string, ToolSettingsView> = {};

  for (const toolId of Object.keys(toolRegistry)) {
    const toolDef = toolRegistry[toolId];
    if (!toolDef) {
      continue;
    }
    const merged: Record<string, unknown> = {
      ...(toolDef.defaultSettings as Record<string, unknown>),
    };
    applyGlobalLayer(merged, global);
    applyToolPersistenceLayer(toolId, persistence, merged);
    const values = maskSecretsForClient(merged);
    const secretMap = TOOL_SECRET_STORAGE[toolId];
    if (secretMap) {
      for (const fieldName of Object.keys(secretMap)) {
        const raw = merged[fieldName];
        values[fieldName] = {
          set: typeof raw === 'string' && raw.length > 0,
        };
      }
    }
    tools[toolId] = {
      values,
      inheritedFromGlobal: inheritedFromGlobalForTool(toolId, persistence),
    };
  }

  return { global, tools };
}

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
