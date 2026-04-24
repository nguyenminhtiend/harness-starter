import { describe, expect, it } from 'bun:test';
import { createSimpleChatAgent } from '@harness/agents';
import { mockModel } from '@harness/agents/testing';
import { z } from 'zod';
import { fromMastraAgent } from './from-agent.ts';

describe('fromMastraAgent', () => {
  it('produces a CapabilityDefinition with agent runner', () => {
    const model = mockModel([{ type: 'text', text: 'Hello!' }]);
    const cap = fromMastraAgent({
      id: 'test-chat',
      title: 'Test Chat',
      description: 'Test capability',
      inputSchema: z.object({ message: z.string() }),
      outputSchema: z.object({ text: z.string() }),
      settingsSchema: z.object({}),
      createAgent: () => createSimpleChatAgent({ model }),
      extractPrompt: (input) => input.message,
      maxSteps: 3,
    });

    expect(cap.id).toBe('test-chat');
    expect(cap.title).toBe('Test Chat');
    expect(cap.description).toBe('Test capability');
    expect(cap.runner.kind).toBe('agent');
    expect(cap.supportsApproval).toBeUndefined();
  });

  it('runner.build returns an agent and runner.extractPrompt extracts prompt', () => {
    const model = mockModel([]);
    const cap = fromMastraAgent({
      id: 'test-chat',
      title: 'Test Chat',
      description: 'Test',
      inputSchema: z.object({ message: z.string() }),
      outputSchema: z.object({ text: z.string() }),
      settingsSchema: z.object({}),
      createAgent: () => createSimpleChatAgent({ model }),
      extractPrompt: (input) => input.message,
    });

    if (cap.runner.kind === 'agent') {
      const agent = cap.runner.build({});
      expect(agent).toBeDefined();
      expect(cap.runner.extractPrompt({ message: 'hello' })).toBe('hello');
    }
  });

  it('passes maxSteps to runner', () => {
    const model = mockModel([]);
    const cap = fromMastraAgent({
      id: 'test',
      title: 'Test',
      description: 'Test',
      inputSchema: z.object({ message: z.string() }),
      outputSchema: z.object({ text: z.string() }),
      settingsSchema: z.object({}),
      createAgent: () => createSimpleChatAgent({ model }),
      extractPrompt: (input) => input.message,
      maxSteps: 10,
    });

    if (cap.runner.kind === 'agent') {
      expect(cap.runner.maxSteps).toBe(10);
    }
  });
});
