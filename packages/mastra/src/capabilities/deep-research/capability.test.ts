import { describe, expect, test } from 'bun:test';
import { noopLogger } from '@mastra/core/logger';
import { createDeepResearchCapability } from './capability.ts';

describe('createDeepResearchCapability', () => {
  const cap = createDeepResearchCapability(noopLogger);

  test('has correct metadata', () => {
    expect(cap.id).toBe('deep-research');
    expect(cap.title).toBe('Deep Research');
    expect(cap.supportsApproval).toBe(true);
  });

  test('runner is a function', () => {
    expect(typeof cap.runner).toBe('function');
  });

  test('inputSchema validates correct input', () => {
    const result = cap.inputSchema.safeParse({
      question: 'What is quantum computing?',
    });
    expect(result.success).toBe(true);
  });

  test('inputSchema rejects empty question', () => {
    const result = cap.inputSchema.safeParse({
      question: '',
    });
    expect(result.success).toBe(false);
  });

  test('settingsSchema validates correct settings', () => {
    const result = cap.settingsSchema.safeParse({
      model: 'ollama:qwen2.5:3b',
      depth: 'basic',
    });
    expect(result.success).toBe(true);
  });
});
