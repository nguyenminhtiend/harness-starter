import { describe, expect, test } from 'bun:test';
import { Agent } from '@mastra/core/agent';
import { mockModel } from './testing.ts';

describe('mockModel', () => {
  test('replays a text response via Agent.generate', async () => {
    const model = mockModel([{ type: 'text', text: 'Hello from mock' }]);
    const agent = new Agent({
      id: 'test',
      name: 'Test',
      instructions: 'Be helpful.',
      model,
    });
    const result = await agent.generate('hi');
    expect(result.text).toBe('Hello from mock');
  });

  test('throws when scripted responses are exhausted', async () => {
    const model = mockModel([]);
    const agent = new Agent({
      id: 'test',
      name: 'Test',
      instructions: 'Be helpful.',
      model,
    });
    await expect(agent.generate('hi')).rejects.toThrow('no scripted response');
  });
});
