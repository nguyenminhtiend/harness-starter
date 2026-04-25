import { describe, expect, test } from 'bun:test';
import { noopLogger } from '@mastra/core/logger';
import { createSimpleChatCapability } from './capability.ts';

describe('createSimpleChatCapability', () => {
  const cap = createSimpleChatCapability(noopLogger);

  test('has correct metadata', () => {
    expect(cap.id).toBe('simple-chat');
    expect(cap.title).toBe('Simple Chat');
    expect(cap.supportsApproval).toBeFalsy();
  });

  test('runner is a function', () => {
    expect(typeof cap.runner).toBe('function');
  });

  test('inputSchema validates correct input', () => {
    const result = cap.inputSchema.safeParse({
      message: 'hello',
    });
    expect(result.success).toBe(true);
  });

  test('inputSchema rejects empty message', () => {
    const result = cap.inputSchema.safeParse({
      message: '',
    });
    expect(result.success).toBe(false);
  });

  test('settingsSchema validates correct settings', () => {
    const result = cap.settingsSchema.safeParse({
      model: 'ollama:qwen2.5:3b',
    });
    expect(result.success).toBe(true);
  });
});
