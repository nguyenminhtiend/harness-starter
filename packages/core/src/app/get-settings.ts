import type { SettingsStore } from '../storage/inmem-settings-store.ts';

export interface GetSettingsDeps {
  readonly settingsStore: SettingsStore;
}

export async function getSettings(
  deps: GetSettingsDeps,
  scope: string,
): Promise<Record<string, unknown>> {
  const global = await deps.settingsStore.getAll('global');
  if (scope === 'global') {
    return global;
  }
  const scoped = await deps.settingsStore.getAll(scope);
  return { ...global, ...scoped };
}
