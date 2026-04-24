import type { CapabilityDefinition } from '../domain/capability.ts';

export interface CapabilityRegistry {
  list(): CapabilityDefinition[];
  get(id: string): CapabilityDefinition | undefined;
}
