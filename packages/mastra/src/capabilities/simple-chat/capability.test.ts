import { describe, expect, test } from 'bun:test';
import { simpleChatCapability } from './capability.ts';

describe('simpleChatCapability', () => {
  test('has correct metadata', () => {
    expect(simpleChatCapability.id).toBe('simple-chat');
    expect(simpleChatCapability.title).toBe('Simple Chat');
    expect(simpleChatCapability.supportsApproval).toBeFalsy();
  });

  test('runner is a function', () => {
    expect(typeof simpleChatCapability.runner).toBe('function');
  });

  test('inputSchema validates correct input', () => {
    const result = simpleChatCapability.inputSchema.safeParse({
      message: 'hello',
    });
    expect(result.success).toBe(true);
  });

  test('inputSchema rejects empty message', () => {
    const result = simpleChatCapability.inputSchema.safeParse({
      message: '',
    });
    expect(result.success).toBe(false);
  });

  test('settingsSchema validates correct settings', () => {
    const result = simpleChatCapability.settingsSchema.safeParse({
      model: 'ollama:qwen2.5:3b',
    });
    expect(result.success).toBe(true);
  });
});
