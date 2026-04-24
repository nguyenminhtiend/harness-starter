export interface Span {
  end(): void;
  setStatus(status: 'ok' | 'error'): void;
  setAttribute(key: string, value: string | number | boolean): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
}
