import type { Span, Tracer } from '@harness/core';

const noopSpan: Span = {
  end() {},
  setStatus(_status) {},
  setAttribute(_key, _value) {},
};

export function createNoOpTracer(): Tracer {
  return {
    startSpan(_name, _attributes?) {
      return noopSpan;
    },
  };
}
