import { describe, expect, it } from 'bun:test';
import { createSimpleChatAgent } from '@harness/agents';
import { mockModel } from '@harness/agents/testing';
import type { CapabilityEvent, ExecutionContext } from '@harness/core';
import { z } from 'zod';
import { fromMastraAgent } from './from-agent.ts';

function makeCtx(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    runId: 'r-1',
    settings: {},
    memory: null,
    signal: new AbortController().signal,
    approvals: { request: () => Promise.reject(new Error('not expected')) },
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
      child() {
        return this;
      },
    },
    ...overrides,
  };
}

function makeCapability(responses: Parameters<typeof mockModel>[0]) {
  const model = mockModel(responses);
  return fromMastraAgent({
    id: 'test-chat',
    title: 'Test Chat',
    description: 'Test capability',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ text: z.string() }),
    settingsSchema: z.object({}),
    createAgent: () => createSimpleChatAgent({ model }),
    extractPrompt: (input) => input.message,
  });
}

describe('fromMastraAgent', () => {
  it('produces step-finished events from the Mastra stream', async () => {
    const capability = makeCapability([{ type: 'text', text: 'Hello!' }]);

    const events: CapabilityEvent[] = [];
    for await (const event of capability.execute({ message: 'hi' }, makeCtx())) {
      events.push(event);
    }

    const stepFinished = events.filter((e) => e.type === 'step-finished');
    expect(stepFinished.length).toBeGreaterThan(0);
  });

  it('produces tool-called events for tool use', async () => {
    const capability = makeCapability([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'calculator',
        args: { expression: '2 + 3' },
      },
      { type: 'text', text: 'The answer is 5.' },
    ]);

    const events: CapabilityEvent[] = [];
    for await (const event of capability.execute({ message: 'What is 2+3?' }, makeCtx())) {
      events.push(event);
    }

    const toolCalled = events.filter((e) => e.type === 'tool-called');
    expect(toolCalled.length).toBeGreaterThan(0);
    if (toolCalled[0]?.type === 'tool-called') {
      expect(toolCalled[0].tool).toBe('calculator');
    }
  });

  it('produces usage events at stream end', async () => {
    const capability = makeCapability([{ type: 'text', text: 'Hello!' }]);

    const events: CapabilityEvent[] = [];
    for await (const event of capability.execute({ message: 'hi' }, makeCtx())) {
      events.push(event);
    }

    const usage = events.filter((e) => e.type === 'usage');
    expect(usage.length).toBeGreaterThan(0);
    if (usage[0]?.type === 'usage') {
      expect(usage[0].usage.inputTokens).toBeDefined();
    }
  });

  it('exposes metadata from config', () => {
    const capability = makeCapability([]);

    expect(capability.id).toBe('test-chat');
    expect(capability.title).toBe('Test Chat');
    expect(capability.description).toBe('Test capability');
    expect(capability.supportsApproval).toBeUndefined();
  });
});
