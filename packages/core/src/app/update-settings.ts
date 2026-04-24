import type { SettingsStore } from '../ports/settings-store.ts';

export interface UpdateSettingsDeps {
  readonly settingsStore: SettingsStore;
}

export async function updateSettings(
  deps: UpdateSettingsDeps,
  scope: string,
  settings: Record<string, unknown>,
): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null) {
      await deps.settingsStore.delete(scope, key);
    } else {
      await deps.settingsStore.set(scope, key, value);
    }
  }
}
