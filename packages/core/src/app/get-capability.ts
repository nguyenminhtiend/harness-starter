import type { CapabilityDefinition } from '../domain/capability.ts';
import { NotFoundError } from '../domain/errors.ts';
import type { CapabilityRegistry } from '../ports/capability-registry.ts';

export interface GetCapabilityDeps {
  readonly capabilityRegistry: CapabilityRegistry;
}

export function getCapability(deps: GetCapabilityDeps, id: string): CapabilityDefinition {
  const cap = deps.capabilityRegistry.get(id);
  if (!cap) {
    throw new NotFoundError('Capability', id);
  }
  return cap;
}
