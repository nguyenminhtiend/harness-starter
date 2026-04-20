import { DEFAULT_GLOBAL_SETTINGS, type GlobalSettings } from '../shared/settings.ts';
import type { Persistence } from './persistence.ts';

export const GLOBAL_TOOL_KEYS = ['model', 'budgetUsd', 'maxTokens', 'concurrency'] as const;

export const TOOL_PROMPT_FIELDS: Record<string, Record<string, string>> = {
  'deep-research': {
    planner: 'plannerPrompt',
    writer: 'writerPrompt',
    factChecker: 'factCheckerPrompt',
  },
};

export const TOOL_PROMPT_FIELD_TO_ROLE: Record<string, Record<string, string>> = (() => {
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

export const TOOL_SECRET_STORAGE: Record<string, Record<string, string>> = {};

export type ApiKeysStore = Record<string, Record<string, string>>;

export function promptStorageKey(toolId: string, role: string): string {
  return `${toolId}.prompts.${role}`;
}

export function readMergedGlobalSettings(persistence: Persistence): GlobalSettings {
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

export function readApiKeysStore(persistence: Persistence): ApiKeysStore {
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

export function writeApiKeysStore(persistence: Persistence, next: ApiKeysStore): void {
  if (Object.keys(next).length === 0) {
    persistence.deleteSetting('apiKeys');
    return;
  }
  persistence.upsertSetting('apiKeys', next);
}

export function applyGlobalLayer(target: Record<string, unknown>, global: GlobalSettings): void {
  target.model = global.defaultModel;
  target.budgetUsd = global.budgetUsd;
  target.maxTokens = global.budgetTokens;
  target.concurrency = global.concurrency;
}

export function applyToolPersistenceLayer(
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
