import { describe, expect, it } from 'bun:test';
import { createProviderResolver } from './resolver.ts';
import type { ProviderKeys } from './types.ts';

describe('createProviderResolver', () => {
  const resolver = createProviderResolver();

  describe('resolve', () => {
    it('resolves a google model when the google key is present', () => {
      const keys: ProviderKeys = { google: 'gk-123' };
      const result = resolver.resolve('google:gemini-2.5-flash', keys);
      expect(result).toEqual({
        modelId: 'google:gemini-2.5-flash',
        provider: 'google',
        displayName: 'Gemini 2.5 Flash',
      });
    });

    it('resolves a groq model when the groq key is present', () => {
      const keys: ProviderKeys = { groq: 'gsk-abc' };
      const result = resolver.resolve('groq:llama-3.3-70b-versatile', keys);
      expect(result).toEqual({
        modelId: 'groq:llama-3.3-70b-versatile',
        provider: 'groq',
        displayName: 'Llama 3.3 70B',
      });
    });

    it('resolves an openrouter model when the openrouter key is present', () => {
      const keys: ProviderKeys = { openrouter: 'or-key' };
      const result = resolver.resolve('openrouter:anthropic/claude-sonnet-4', keys);
      expect(result).toEqual({
        modelId: 'openrouter:anthropic/claude-sonnet-4',
        provider: 'openrouter',
        displayName: 'Claude Sonnet 4',
      });
    });

    it('resolves an ollama model without any key', () => {
      const keys: ProviderKeys = {};
      const result = resolver.resolve('ollama:qwen2.5:3b', keys);
      expect(result).toEqual({
        modelId: 'ollama:qwen2.5:3b',
        provider: 'ollama',
        displayName: 'Qwen 2.5 3B (local)',
      });
    });

    it('returns undefined when provider key is missing', () => {
      const keys: ProviderKeys = {};
      expect(resolver.resolve('google:gemini-2.5-flash', keys)).toBeUndefined();
    });

    it('returns a ModelConfig with the modelId as displayName for unknown models', () => {
      const keys: ProviderKeys = { google: 'gk-123' };
      const result = resolver.resolve('google:some-future-model', keys);
      expect(result).toEqual({
        modelId: 'google:some-future-model',
        provider: 'google',
        displayName: 'google:some-future-model',
      });
    });

    it('extracts provider from prefix even for deeply nested model ids', () => {
      const keys: ProviderKeys = { openrouter: 'or-key' };
      const result = resolver.resolve('openrouter:openai/gpt-4.1', keys);
      expect(result?.provider).toBe('openrouter');
    });
  });

  describe('list', () => {
    it('returns only ollama models when no keys are provided', () => {
      const keys: ProviderKeys = {};
      const models = resolver.list(keys);
      expect(models.every((m) => m.provider === 'ollama')).toBe(true);
      expect(models.length).toBe(3);
    });

    it('includes google models when google key is present', () => {
      const keys: ProviderKeys = { google: 'gk-123' };
      const models = resolver.list(keys);
      const googleModels = models.filter((m) => m.provider === 'google');
      expect(googleModels.length).toBe(3);
      expect(models.some((m) => m.provider === 'ollama')).toBe(true);
    });

    it('includes all models when all keys are present', () => {
      const keys: ProviderKeys = { google: 'gk', openrouter: 'or', groq: 'gsk' };
      const models = resolver.list(keys);
      expect(models.length).toBe(15);
    });

    it('includes groq + ollama models when only groq key is present', () => {
      const keys: ProviderKeys = { groq: 'gsk' };
      const models = resolver.list(keys);
      const providers = new Set(models.map((m) => m.provider));
      expect(providers.has('groq')).toBe(true);
      expect(providers.has('ollama')).toBe(true);
      expect(providers.has('google')).toBe(false);
      expect(providers.has('openrouter')).toBe(false);
    });

    it('returns ModelEntry objects with id, provider, and displayName', () => {
      const keys: ProviderKeys = { google: 'gk' };
      const models = resolver.list(keys);
      for (const m of models) {
        expect(m).toHaveProperty('id');
        expect(m).toHaveProperty('provider');
        expect(m).toHaveProperty('displayName');
      }
    });
  });
});
