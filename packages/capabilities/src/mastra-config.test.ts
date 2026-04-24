import { describe, expect, test } from 'bun:test';
import { buildMastraConfig } from './mastra-config.ts';
import { createCapabilityRegistry } from './registry.ts';

describe('buildMastraConfig', () => {
  test('returns agents and workflows covering all registered capabilities', () => {
    const registry = createCapabilityRegistry();
    const config = buildMastraConfig({ model: 'test-model' });

    const agentCount = Object.keys(config.agents).length;
    const workflowCount = Object.keys(config.workflows).length;

    expect(agentCount + workflowCount).toBe(registry.list().length);
  });

  test('includes simpleChatAgent in agents', () => {
    const config = buildMastraConfig({ model: 'test-model' });
    expect(config.agents.simpleChatAgent).toBeDefined();
  });

  test('includes deepResearch in workflows', () => {
    const config = buildMastraConfig({ model: 'test-model' });
    expect(config.workflows.deepResearch).toBeDefined();
  });

  test('each registered capability has a matching Mastra entry', () => {
    const registry = createCapabilityRegistry();
    const config = buildMastraConfig({ model: 'test-model' });

    const capabilityToMastraKey: Record<string, string> = {
      'simple-chat': 'simpleChatAgent',
      'deep-research': 'deepResearch',
    };

    for (const cap of registry.list()) {
      const key = capabilityToMastraKey[cap.id];
      expect(key).toBeDefined();
      const found = key in config.agents || key in config.workflows;
      expect(found).toBe(true);
    }
  });
});
