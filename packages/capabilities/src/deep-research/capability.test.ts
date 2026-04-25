import { describe, expect, test } from 'bun:test';
import { mockModel } from '@harness/mastra/testing';
import { deepResearchCapability } from './capability.ts';

describe('deepResearchCapability', () => {
  test('has correct metadata', () => {
    expect(deepResearchCapability.id).toBe('deep-research');
    expect(deepResearchCapability.title).toBe('Deep Research');
    expect(deepResearchCapability.supportsApproval).toBe(true);
  });

  test('runner kind is workflow', () => {
    expect(deepResearchCapability.runner.kind).toBe('workflow');
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

  test('runner.build creates a workflow', () => {
    const model = mockModel([
      { type: 'text', text: '{}' },
      { type: 'text', text: '{}' },
      { type: 'text', text: '{}' },
      { type: 'text', text: '{}' },
    ]);

    if (deepResearchCapability.runner.kind === 'workflow') {
      const wf = deepResearchCapability.runner.build({ model });
      expect(wf).toBeDefined();
    }
  });

  test('runner.extractInput extracts question from input', () => {
    if (deepResearchCapability.runner.kind === 'workflow') {
      const input = deepResearchCapability.runner.extractInput({ question: 'What is X?' });
      expect(input).toEqual({ question: 'What is X?' });
    }
  });

  test('runner.approveStepId is set', () => {
    if (deepResearchCapability.runner.kind === 'workflow') {
      expect(deepResearchCapability.runner.approveStepId).toBe('approve');
    }
  });
});
