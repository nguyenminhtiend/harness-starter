import { describe, expect, test } from 'bun:test';
import { deepResearchCapability } from './capability.ts';

describe('deepResearchCapability', () => {
  test('has correct metadata', () => {
    expect(deepResearchCapability.id).toBe('deep-research');
    expect(deepResearchCapability.title).toBe('Deep Research');
    expect(deepResearchCapability.supportsApproval).toBe(true);
  });

  test('runner is a function', () => {
    expect(typeof deepResearchCapability.runner).toBe('function');
  });

  test('inputSchema validates correct input', () => {
    const result = deepResearchCapability.inputSchema.safeParse({
      question: 'What is quantum computing?',
    });
    expect(result.success).toBe(true);
  });

  test('inputSchema rejects empty question', () => {
    const result = deepResearchCapability.inputSchema.safeParse({
      question: '',
    });
    expect(result.success).toBe(false);
  });

  test('settingsSchema validates correct settings', () => {
    const result = deepResearchCapability.settingsSchema.safeParse({
      model: 'ollama:qwen2.5:3b',
      depth: 'basic',
    });
    expect(result.success).toBe(true);
  });
});
