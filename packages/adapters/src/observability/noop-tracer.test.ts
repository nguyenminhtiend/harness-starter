import { describe, expect, it } from 'bun:test';
import type { Tracer } from '@harness/core';
import { createNoOpTracer } from './noop-tracer.ts';

describe('NoOpTracer', () => {
  it('satisfies the Tracer interface', () => {
    const tracer: Tracer = createNoOpTracer();
    expect(typeof tracer.startSpan).toBe('function');
  });

  it('startSpan returns a Span with all methods', () => {
    const tracer = createNoOpTracer();
    const span = tracer.startSpan('test-op', { key: 'val' });
    expect(typeof span.end).toBe('function');
    expect(typeof span.setStatus).toBe('function');
    expect(typeof span.setAttribute).toBe('function');
  });

  it('span methods are no-ops that do not throw', () => {
    const tracer = createNoOpTracer();
    const span = tracer.startSpan('test-op');
    expect(() => {
      span.setAttribute('k', 'v');
      span.setStatus('ok');
      span.end();
    }).not.toThrow();
  });
});
