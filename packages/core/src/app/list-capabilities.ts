import type { Capability } from '../domain/capability.ts';
import type { CapabilityRegistry } from '../ports/capability-registry.ts';

export interface ListCapabilitiesDeps {
  readonly capabilityRegistry: CapabilityRegistry;
}

export function listCapabilities(deps: ListCapabilitiesDeps): Capability[] {
  return deps.capabilityRegistry.list();
}
