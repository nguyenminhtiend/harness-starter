import type { CapabilityDefinition, CapabilityRegistry } from '@harness/core';
import { deepResearchCapability } from './deep-research/capability.ts';
import { simpleChatCapability } from './simple-chat/capability.ts';

export function createCapabilityRegistry(): CapabilityRegistry {
  const capabilities: CapabilityDefinition[] = [simpleChatCapability, deepResearchCapability];

  const byId = new Map(capabilities.map((c) => [c.id, c]));

  return {
    list: () => [...capabilities],
    get: (id) => byId.get(id),
  };
}
