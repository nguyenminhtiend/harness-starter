import { describe, expect, it } from 'bun:test';
import { knownModels, listAvailableModels } from './catalog.ts';
import type { ProviderKeys } from './types.ts';

describe('knownModels', () => {
  it('is a non-empty array of ModelEntry objects', () => {
    expect(knownModels.length).toBeGreaterThan(0);
    for (const entry of knownModels) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.provider).toBe('string');
    }
  });

  it('includes entries for all three providers', () => {
    const providers = new Set(knownModels.map((m) => m.provider));
    expect(providers.has('google')).toBe(true);
    expect(providers.has('openrouter')).toBe(true);
    expect(providers.has('groq')).toBe(true);
  });
});

describe('listAvailableModels', () => {
  it('returns empty array when no keys are configured', () => {
    const keys: ProviderKeys = {};
    expect(listAvailableModels(keys)).toEqual([]);
  });

  it('returns only google models when only google key is set', () => {
    const keys: ProviderKeys = { google: 'k' };
    const models = listAvailableModels(keys);
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'google')).toBe(true);
  });

  it('returns only groq models when only groq key is set', () => {
    const keys: ProviderKeys = { groq: 'k' };
    const models = listAvailableModels(keys);
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'groq')).toBe(true);
  });

  it('returns only openrouter models when only openrouter key is set', () => {
    const keys: ProviderKeys = { openrouter: 'k' };
    const models = listAvailableModels(keys);
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === 'openrouter')).toBe(true);
  });

  it('returns models from all configured providers', () => {
    const keys: ProviderKeys = { google: 'g', groq: 'q', openrouter: 'o' };
    const models = listAvailableModels(keys);
    const providers = new Set(models.map((m) => m.provider));
    expect(providers.has('google')).toBe(true);
    expect(providers.has('groq')).toBe(true);
    expect(providers.has('openrouter')).toBe(true);
  });

  it('each model id starts with its provider prefix', () => {
    const keys: ProviderKeys = { google: 'g', groq: 'q', openrouter: 'o' };
    const models = listAvailableModels(keys);
    for (const m of models) {
      expect(m.id.startsWith(`${m.provider}:`)).toBe(true);
    }
  });
});
