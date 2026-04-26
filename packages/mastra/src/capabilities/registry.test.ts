import { describe, expect, test } from 'bun:test';
import { Mastra } from '@mastra/core';
import { createSimpleChatAgent } from '../agents/index.ts';
import { mockModel } from '../agents/testing.ts';
import { createDeepResearchWorkflow } from '../workflows/index.ts';
import { createDeepResearchCapability } from './deep-research/capability.ts';
import { createCapabilityRegistry } from './registry.ts';
import { createSimpleChatCapability } from './simple-chat/capability.ts';

function testMastra() {
  const model = mockModel([{ type: 'text', text: 'test' }]);
  return new Mastra({
    agents: { simpleChatAgent: createSimpleChatAgent({ model }) },
    workflows: { deepResearch: createDeepResearchWorkflow({ model }) },
  });
}

describe('createCapabilityRegistry', () => {
  const mastra = testMastra();
  const registry = createCapabilityRegistry([
    createSimpleChatCapability({ mastra }),
    createDeepResearchCapability({ mastra }),
  ]);

  test('list() returns simple-chat and deep-research', () => {
    const caps = registry.list();
    expect(caps.length).toBeGreaterThanOrEqual(2);
    expect(caps.some((c) => c.id === 'simple-chat')).toBe(true);
    expect(caps.some((c) => c.id === 'deep-research')).toBe(true);
  });

  test('get("simple-chat") returns the capability', () => {
    const cap = registry.get('simple-chat');
    expect(cap).toBeDefined();
    expect(cap?.id).toBe('simple-chat');
    expect(cap?.title).toBe('Simple Chat');
  });

  test('get("deep-research") returns the capability', () => {
    const cap = registry.get('deep-research');
    expect(cap).toBeDefined();
    expect(cap?.id).toBe('deep-research');
    expect(cap?.title).toBe('Deep Research');
    expect(cap?.supportsApproval).toBe(true);
  });

  test('get("unknown") returns undefined', () => {
    const cap = registry.get('unknown');
    expect(cap).toBeUndefined();
  });
});
