import { describe, expect, test } from 'bun:test';
import { resolveModel } from './resolve-model.ts';

describe('resolveModel', () => {
  test('returns the value as-is when it is not a string', () => {
    const model = { generate: () => {} };
    expect(resolveModel(model)).toBe(model);
  });

  test('calls createLanguageModel for string values', () => {
    expect(() => resolveModel('ollama:qwen2.5:3b')).not.toThrow();
  });

  test('throws for invalid model ID strings', () => {
    expect(() => resolveModel('no-colon')).toThrow('Invalid model ID format');
  });
});
