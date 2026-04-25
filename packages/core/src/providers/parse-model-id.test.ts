import { describe, expect, it } from 'bun:test';
import { parseModelId } from './parse-model-id.ts';

describe('parseModelId', () => {
  it('splits provider:model format', () => {
    expect(parseModelId('ollama:llama3')).toEqual({ provider: 'ollama', model: 'llama3' });
  });

  it('returns modelId as both provider and model when no colon', () => {
    expect(parseModelId('gpt-4o')).toEqual({ provider: 'gpt-4o', model: 'gpt-4o' });
  });

  it('handles provider with nested model path', () => {
    expect(parseModelId('google:gemini-2.0-flash')).toEqual({
      provider: 'google',
      model: 'gemini-2.0-flash',
    });
  });
});
