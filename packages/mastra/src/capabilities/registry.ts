import type { CapabilityDefinition, CapabilityRegistry } from '@harness/core';
import type { IMastraLogger } from '@mastra/core/logger';
import { createDeepResearchCapability } from './deep-research/capability.ts';
import { createSimpleChatCapability } from './simple-chat/capability.ts';

export function createCapabilityRegistry(logger: IMastraLogger): CapabilityRegistry {
  const capabilities: CapabilityDefinition[] = [
    createSimpleChatCapability(logger),
    createDeepResearchCapability(logger),
  ];

  const byId = new Map(capabilities.map((c) => [c.id, c]));

  return {
    list: () => [...capabilities],
    get: (id) => byId.get(id),
  };
}
