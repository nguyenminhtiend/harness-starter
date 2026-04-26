import { describe, expect, test } from 'bun:test';
import { createSimpleChatAgent } from './simple-chat.ts';
import { mockModel } from './testing.ts';

describe('simpleChatAgent', () => {
  test('has correct id and name', () => {
    const model = mockModel([]);
    const agent = createSimpleChatAgent({ model });
    expect(agent.id).toBe('simple-chat');
    expect(agent.name).toBe('Simple Chat');
  });

  test('constructs without error when scorers default (factory wires defaultAgentScorers)', () => {
    const model = mockModel([]);
    const agent = createSimpleChatAgent({ model });
    expect(agent).toBeDefined();
    expect(agent.id).toBe('simple-chat');
  });

  test('accepts explicit empty scorers override', () => {
    const model = mockModel([]);
    const agent = createSimpleChatAgent({ model, scorers: {} });
    expect(agent).toBeDefined();
  });

  test('calls calculator tool and returns final text', async () => {
    const model = mockModel([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'calculator',
        args: { expression: '2 + 3' },
      },
      { type: 'text', text: 'The result of 2 + 3 is 5.' },
    ]);
    const agent = createSimpleChatAgent({ model });
    const result = await agent.generate('What is 2 + 3?');
    expect(result.text).toBe('The result of 2 + 3 is 5.');
  });

  test('calls get_time tool and returns final text', async () => {
    const model = mockModel([
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'get_time',
        args: {},
      },
      { type: 'text', text: 'The current time is 3:00 PM UTC.' },
    ]);
    const agent = createSimpleChatAgent({ model });
    const result = await agent.generate('What time is it?');
    expect(result.text).toBe('The current time is 3:00 PM UTC.');
  });

  test('responds without tools when not needed', async () => {
    const model = mockModel([{ type: 'text', text: 'Hello! How can I help?' }]);
    const agent = createSimpleChatAgent({ model });
    const result = await agent.generate('hi');
    expect(result.text).toBe('Hello! How can I help?');
  });
});
