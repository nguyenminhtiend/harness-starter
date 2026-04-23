import { describe, expect, test } from 'bun:test';
import { simpleChatToolDef } from './index.ts';

describe('simpleChatToolDef', () => {
  test('has correct metadata', () => {
    expect(simpleChatToolDef.id).toBe('simple-chat');
    expect(simpleChatToolDef.title).toBeDefined();
    expect(simpleChatToolDef.settingsSchema).toBeDefined();
    expect(simpleChatToolDef.runtime).toBe('mastra');
  });

  test('defaultSettings parses cleanly', () => {
    const defaults = simpleChatToolDef.defaultSettings;
    expect(defaults.maxTurns).toBe(5);
    expect(defaults.systemPrompt).toBeDefined();
  });

  test('createAgent returns a Mastra Agent with correct id', () => {
    const agent = simpleChatToolDef.createAgent(simpleChatToolDef.defaultSettings);
    expect(agent.id).toBe('simple-chat');
    expect(agent.name).toBe('Simple Chat');
  });
});
