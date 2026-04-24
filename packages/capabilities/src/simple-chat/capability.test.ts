import { describe, expect, test } from 'bun:test';
import { mockModel } from '@harness/agents/testing';
import { simpleChatCapability } from './capability.ts';

describe('simpleChatCapability', () => {
  test('has correct metadata', () => {
    expect(simpleChatCapability.id).toBe('simple-chat');
    expect(simpleChatCapability.title).toBe('Simple Chat');
    expect(simpleChatCapability.supportsApproval).toBeFalsy();
  });

  test('runner kind is agent', () => {
    expect(simpleChatCapability.runner.kind).toBe('agent');
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

  test('runner.build creates an agent with the given model', () => {
    const model = mockModel([{ type: 'text', text: 'Hello there!' }]);
    const cap = simpleChatCapability.__createWithModel(model);

    if (cap.runner.kind === 'agent') {
      const agent = cap.runner.build({});
      expect(agent).toBeDefined();
    }
  });

  test('runner.extractPrompt extracts message from input', () => {
    if (simpleChatCapability.runner.kind === 'agent') {
      const prompt = simpleChatCapability.runner.extractPrompt({ message: 'hi there' });
      expect(prompt).toBe('hi there');
    }
  });
});
