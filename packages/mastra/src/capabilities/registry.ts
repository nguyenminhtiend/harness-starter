import type { CapabilityDefinition, CapabilityRegistry } from '@harness/core';

export function createCapabilityRegistry(capabilities: CapabilityDefinition[]): CapabilityRegistry {
  const byId = new Map(capabilities.map((c) => [c.id, c]));

  return {
    list: () => [...capabilities],
    get: (id) => byId.get(id),
  };
}
