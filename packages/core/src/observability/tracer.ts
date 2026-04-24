export interface Span {
  end(): void;
  setStatus(status: 'ok' | 'error'): void;
  setAttribute(key: string, value: string | number | boolean): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
}

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
