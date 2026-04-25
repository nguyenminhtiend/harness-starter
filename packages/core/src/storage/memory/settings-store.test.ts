import { describe, expect, it } from 'bun:test';
import type { SettingsStore } from './settings-store.ts';
import { createInMemorySettingsStore } from './settings-store.ts';

function makeStore(): SettingsStore {
  return createInMemorySettingsStore();
}

describe('InMemorySettingsStore', () => {
  it('sets and gets a value', async () => {
    const store = makeStore();
    await store.set('global', 'model', 'gpt-4o');

    expect(await store.get('global', 'model')).toBe('gpt-4o');
  });

  it('returns undefined for non-existent key', async () => {
    const store = makeStore();
    expect(await store.get('global', 'nope')).toBeUndefined();
  });

  it('overwrites existing value', async () => {
    const store = makeStore();
    await store.set('global', 'model', 'gpt-4o');
    await store.set('global', 'model', 'claude-4');

    expect(await store.get('global', 'model')).toBe('claude-4');
  });

  it('isolates scopes', async () => {
    const store = makeStore();
    await store.set('global', 'model', 'gpt-4o');
    await store.set('simple-chat', 'model', 'claude-4');

    expect(await store.get('global', 'model')).toBe('gpt-4o');
    expect(await store.get('simple-chat', 'model')).toBe('claude-4');
  });

  it('getAll returns all keys for a scope', async () => {
    const store = makeStore();
    await store.set('global', 'model', 'gpt-4o');
    await store.set('global', 'temperature', 0.7);
    await store.set('other', 'model', 'claude-4');

    const all = await store.getAll('global');
    expect(all).toEqual({ model: 'gpt-4o', temperature: 0.7 });
  });

  it('getAll returns empty object for non-existent scope', async () => {
    const store = makeStore();
    expect(await store.getAll('nope')).toEqual({});
  });

  it('deletes a key', async () => {
    const store = makeStore();
    await store.set('global', 'model', 'gpt-4o');
    await store.delete('global', 'model');

    expect(await store.get('global', 'model')).toBeUndefined();
  });

  it('delete is a no-op for non-existent key', async () => {
    const store = makeStore();
    await store.delete('global', 'nope');
  });

  it('stores complex values', async () => {
    const store = makeStore();
    const value = { nested: { deep: [1, 2, 3] } };
    await store.set('global', 'config', value);

    expect(await store.get('global', 'config')).toEqual(value);
  });
});
