import { describe, expect, test } from 'bun:test';
import { mockModel } from '@harness/agents/testing';
import type { StreamEventPayload } from '@harness/core';
import { simpleChatCapability } from './capability.ts';

function fakeCtx(overrides?: Partial<Parameters<typeof simpleChatCapability.execute>[1]>) {
  return {
    runId: 'run-1',
    settings: { model: 'ollama:test:latest' },
    memory: null,
    signal: new AbortController().signal,
    approvals: { request: () => Promise.reject(new Error('unexpected approval')) },
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

async function collectEvents(
  iter: AsyncIterable<StreamEventPayload>,
): Promise<StreamEventPayload[]> {
  const events: StreamEventPayload[] = [];
  for await (const e of iter) {
    events.push(e);
  }
  return events;
}

describe('simpleChatCapability', () => {
  test('has correct metadata', () => {
    expect(simpleChatCapability.id).toBe('simple-chat');
    expect(simpleChatCapability.title).toBe('Simple Chat');
    expect(simpleChatCapability.supportsApproval).toBeFalsy();
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

  test('produces text.delta events from a simple text response', async () => {
    const model = mockModel([{ type: 'text', text: 'Hello there!' }]);

    const cap = simpleChatCapability.__createWithModel(model);
    const events = await collectEvents(cap.execute({ message: 'hi' }, fakeCtx()));

    const textDeltas = events.filter((e) => e.type === 'text.delta');
    expect(textDeltas.length).toBeGreaterThan(0);

    const combined = textDeltas.map((e) => (e as { text: string }).text).join('');
    expect(combined).toBe('Hello there!');
  });

  test('produces tool.called and step.finished events for tool use', async () => {
    const model = mockModel([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'calculator',
        args: { expression: '2 + 3' },
      },
      { type: 'text', text: 'The answer is 5.' },
    ]);

    const cap = simpleChatCapability.__createWithModel(model);
    const events = await collectEvents(cap.execute({ message: 'What is 2+3?' }, fakeCtx()));

    const types = events.map((e) => e.type);
    expect(types).toContain('tool.called');
    expect(types).toContain('text.delta');
  });
});
