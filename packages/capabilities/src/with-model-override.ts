import type { Capability } from '@harness/core';

export type CapabilityWithModelOverride<I, O> = Capability<I, O> & {
  __createWithModel: (model: unknown) => Capability<I, O>;
};

export function withModelOverride<I, O>(
  build: (modelOverride?: unknown) => Capability<I, O>,
): CapabilityWithModelOverride<I, O> {
  const base = build();
  return {
    ...base,
    __createWithModel: (model: unknown) => build(model),
  };
}
