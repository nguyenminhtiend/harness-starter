import { describe, expect, it } from 'bun:test';
import { createProvider, parseModelSpec } from './provider.ts';
import type { ProviderKeys } from './types.ts';

describe('parseModelSpec', () => {
  it('parses google:gemini-2.5-flash into provider and model', () => {
    expect(parseModelSpec('google:gemini-2.5-flash')).toEqual({
      provider: 'google',
      model: 'gemini-2.5-flash',
    });
  });

  it('parses openrouter:anthropic/claude-sonnet-4', () => {
    expect(parseModelSpec('openrouter:anthropic/claude-sonnet-4')).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
    });
  });

  it('parses groq:llama-3.3-70b-versatile', () => {
    expect(parseModelSpec('groq:llama-3.3-70b-versatile')).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    });
  });

  it('defaults to openrouter when no prefix is given', () => {
    expect(parseModelSpec('anthropic/claude-sonnet-4')).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
    });
  });

  it('handles model names that contain colons after the first', () => {
    expect(parseModelSpec('openrouter:some:model:v2')).toEqual({
      provider: 'openrouter',
      model: 'some:model:v2',
    });
  });

  it('handles empty string by defaulting to openrouter with empty model', () => {
    expect(parseModelSpec('')).toEqual({
      provider: 'openrouter',
      model: '',
    });
  });
});

describe('createProvider', () => {
  it('throws for unknown provider prefix', () => {
    const keys: ProviderKeys = { google: 'k' };
    expect(() => createProvider(keys, 'azure:gpt-4')).toThrow('Unknown provider');
  });

  it('throws when google key is not configured', () => {
    const keys: ProviderKeys = {};
    expect(() => createProvider(keys, 'google:gemini-2.5-flash')).toThrow(
      'GOOGLE_GENERATIVE_AI_API_KEY not configured',
    );
  });

  it('throws when openrouter key is not configured', () => {
    const keys: ProviderKeys = {};
    expect(() => createProvider(keys, 'openrouter:anthropic/claude-sonnet-4')).toThrow(
      'OPENROUTER_API_KEY not configured',
    );
  });

  it('throws when groq key is not configured', () => {
    const keys: ProviderKeys = {};
    expect(() => createProvider(keys, 'groq:llama-3.3-70b-versatile')).toThrow(
      'GROQ_API_KEY not configured',
    );
  });

  it('returns a Provider for google when key is present', () => {
    const keys: ProviderKeys = { google: 'test-key' };
    const provider = createProvider(keys, 'google:gemini-2.5-flash');
    expect(provider).toBeDefined();
    expect(typeof provider.stream).toBe('function');
  });

  it('returns a Provider for openrouter when key is present', () => {
    const keys: ProviderKeys = { openrouter: 'test-key' };
    const provider = createProvider(keys, 'openrouter:anthropic/claude-sonnet-4');
    expect(provider).toBeDefined();
    expect(typeof provider.stream).toBe('function');
  });

  it('returns a Provider for groq when key is present', () => {
    const keys: ProviderKeys = { groq: 'test-key' };
    const provider = createProvider(keys, 'groq:llama-3.3-70b-versatile');
    expect(provider).toBeDefined();
    expect(typeof provider.stream).toBe('function');
  });
});
