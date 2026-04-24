import type { CapabilityDefinition } from '@harness/core';

export type CapabilityWithModelOverride<I, O> = CapabilityDefinition<I, O> & {
  __createWithModel: (model: unknown) => CapabilityDefinition<I, O>;
};

export function withModelOverride<I, O>(
  build: (modelOverride?: unknown) => CapabilityDefinition<I, O>,
): CapabilityWithModelOverride<I, O> {
  const base = build();
  return {
    ...base,
    __createWithModel: (model: unknown) => build(model),
  };
}
