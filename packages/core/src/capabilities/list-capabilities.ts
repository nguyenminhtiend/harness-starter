import type { CapabilityDefinition } from '../domain/capability.ts';
import type { CapabilityRegistry } from './registry.ts';

export interface ListCapabilitiesDeps {
  readonly capabilityRegistry: CapabilityRegistry;
}

export function listCapabilities(deps: ListCapabilitiesDeps): CapabilityDefinition[] {
  return deps.capabilityRegistry.list();
}
