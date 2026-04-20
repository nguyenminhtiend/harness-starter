import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { loadProviderKeysFromEnv } from './keys.ts';

describe('loadProviderKeysFromEnv', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    saved.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    saved.GROQ_API_KEY = process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it('returns empty object when no keys are set', () => {
    const keys = loadProviderKeysFromEnv();
    expect(keys.google).toBeUndefined();
    expect(keys.openrouter).toBeUndefined();
    expect(keys.groq).toBeUndefined();
  });

  it('picks up GOOGLE_GENERATIVE_AI_API_KEY', () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'gk';
    const keys = loadProviderKeysFromEnv();
    expect(keys.google).toBe('gk');
  });

  it('picks up OPENROUTER_API_KEY', () => {
    process.env.OPENROUTER_API_KEY = 'ork';
    const keys = loadProviderKeysFromEnv();
    expect(keys.openrouter).toBe('ork');
  });

  it('picks up GROQ_API_KEY', () => {
    process.env.GROQ_API_KEY = 'grk';
    const keys = loadProviderKeysFromEnv();
    expect(keys.groq).toBe('grk');
  });

  it('ignores empty string values', () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';
    const keys = loadProviderKeysFromEnv();
    expect(keys.google).toBeUndefined();
  });

  it('returns all keys when all are present', () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'g';
    process.env.OPENROUTER_API_KEY = 'o';
    process.env.GROQ_API_KEY = 'q';
    const keys = loadProviderKeysFromEnv();
    expect(keys.google).toBe('g');
    expect(keys.openrouter).toBe('o');
    expect(keys.groq).toBe('q');
  });
});
