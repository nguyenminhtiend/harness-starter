import type { Capability, CapabilityRegistry } from '@harness/core';
import { simpleChatCapability } from './simple-chat/capability.ts';

export function createCapabilityRegistry(): CapabilityRegistry {
  const capabilities: Capability[] = [simpleChatCapability];

  const byId = new Map(capabilities.map((c) => [c.id, c]));

  return {
    list: () => [...capabilities],
    get: (id) => byId.get(id),
  };
}
