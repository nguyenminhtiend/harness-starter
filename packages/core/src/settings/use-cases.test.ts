import { describe, expect, it } from 'bun:test';
import { createFakeSettingsStore } from '../testing/fakes.ts';
import { getSettings } from './get-settings.ts';
import { updateSettings } from './update-settings.ts';

describe('settings use cases', () => {
  it('getSettings merges global with scoped', async () => {
    const store = createFakeSettingsStore();
    await store.set('global', 'model', 'gpt-4');
    await store.set('simple-chat', 'model', 'claude');
    await store.set('simple-chat', 'temperature', 0.7);

    const result = await getSettings({ settingsStore: store }, 'simple-chat');
    expect(result).toEqual({ model: 'claude', temperature: 0.7 });
  });

  it('getSettings returns only global when scope is global', async () => {
    const store = createFakeSettingsStore();
    await store.set('global', 'model', 'gpt-4');

    const result = await getSettings({ settingsStore: store }, 'global');
    expect(result).toEqual({ model: 'gpt-4' });
  });

  it('updateSettings persists and deletes null values', async () => {
    const store = createFakeSettingsStore();
    await updateSettings({ settingsStore: store }, 'global', { model: 'gpt-4', temp: 0.5 });
    expect(await store.get('global', 'model')).toBe('gpt-4');

    await updateSettings({ settingsStore: store }, 'global', { model: null });
    expect(await store.get('global', 'model')).toBeUndefined();
  });
});
