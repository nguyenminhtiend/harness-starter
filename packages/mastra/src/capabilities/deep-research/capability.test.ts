import { describe, expect, test } from 'bun:test';
import { Mastra } from '@mastra/core';
import { mockModel } from '../../agents/testing.ts';
import { createDeepResearchWorkflow } from '../../workflows/index.ts';
import { createDeepResearchCapability } from './capability.ts';

function testMastra() {
  const model = mockModel([{ type: 'text', text: 'test' }]);
  return new Mastra({
    workflows: { deepResearch: createDeepResearchWorkflow({ model }) },
  });
}

describe('createDeepResearchCapability', () => {
  const cap = createDeepResearchCapability({ mastra: testMastra() });

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
