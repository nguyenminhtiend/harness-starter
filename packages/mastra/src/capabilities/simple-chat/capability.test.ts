import { describe, expect, test } from 'bun:test';
import { Mastra } from '@mastra/core';
import { createSimpleChatAgent } from '../../agents/index.ts';
import { mockModel } from '../../agents/testing.ts';
import { createSimpleChatCapability } from './capability.ts';

function testMastra() {
  const model = mockModel([{ type: 'text', text: 'hi' }]);
  return new Mastra({
    agents: { simpleChatAgent: createSimpleChatAgent({ model }) },
  });
}

describe('createSimpleChatCapability', () => {
  const cap = createSimpleChatCapability({ mastra: testMastra() });

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
