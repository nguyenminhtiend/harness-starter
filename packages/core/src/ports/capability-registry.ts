import type { Capability } from '../domain/capability.ts';

export interface CapabilityRegistry {
  list(): Capability[];
  get(id: string): Capability | undefined;
}
