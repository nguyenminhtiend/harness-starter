import { describe, expect, test } from 'bun:test';
import type { LangfuseClient, LangfuseSpan, LangfuseTrace } from './langfuse.ts';
import { toLangfuse } from './langfuse.ts';
import type { EvalResults } from './types.ts';

function createMockClient() {
  const spans: Array<{ data: Record<string, unknown>; endData?: Record<string, unknown> }> = [];
  const traces: Array<{ data: Record<string, unknown>; updates: Record<string, unknown>[] }> = [];

  const client: LangfuseClient = {
    trace(data) {
      const traceUpdates: Record<string, unknown>[] = [];
      traces.push({ data, updates: traceUpdates });
      const trace: LangfuseTrace = {
        span(spanData) {
          const spanRecord: (typeof spans)[number] = { data: spanData };
          spans.push(spanRecord);
          const span: LangfuseSpan = {
            update(d) {
              spanRecord.data = { ...spanRecord.data, ...d };
            },
            end(d) {
              spanRecord.endData = d;
            },
          };
          return span;
        },
        update(d) {
          traceUpdates.push(d);
        },
      };
      return trace;
    },
  };

  return { client, spans, traces };
}

const sampleResults: EvalResults = {
  name: 'my-eval',
  model: 'gpt-4o',
  createdAt: '2026-04-18T00:00:00Z',
  samples: [
    {
      id: 's1',
      input: 'hello',
      output: 'world',
      expected: 'world',
      scores: { exactMatch: { score: 1 } },
      durationMs: 100,
    },
    {
      id: 's2',
      input: 'foo',
      output: 'bar',
      expected: 'baz',
      scores: { exactMatch: { score: 0 } },
      durationMs: 200,
    },
  ],
};

describe('toLangfuse', () => {
  test('creates one trace per eval', () => {
    const { client, traces } = createMockClient();
    toLangfuse(sampleResults, client);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.data.name).toBe('eval:my-eval');
  });

  test('creates one span per sample', () => {
    const { client, spans } = createMockClient();
    toLangfuse(sampleResults, client);
    expect(spans).toHaveLength(2);
    expect(spans[0]?.data.name).toBe('sample:s1');
    expect(spans[1]?.data.name).toBe('sample:s2');
  });

  test('span end data includes output and scores', () => {
    const { client, spans } = createMockClient();
    toLangfuse(sampleResults, client);
    const endData = spans[0]?.endData as Record<string, unknown>;
    expect(endData.output).toBe('world');
    const meta = endData.metadata as Record<string, unknown>;
    expect(meta.expected).toBe('world');
    expect(meta.durationMs).toBe(100);
  });

  test('trace gets aggregate scores', () => {
    const { client, traces } = createMockClient();
    toLangfuse(sampleResults, client);
    const updates = traces[0]?.updates;
    expect(updates).toHaveLength(1);
    const meta = updates?.[0]?.metadata as Record<string, unknown>;
    const aggregate = meta.aggregateScores as Record<string, number>;
    expect(aggregate.exactMatch).toBe(0.5);
  });

  test('handles empty samples', () => {
    const { client, spans, traces } = createMockClient();
    toLangfuse({ name: 'empty', samples: [] }, client);
    expect(traces).toHaveLength(1);
    expect(spans).toHaveLength(0);
  });
});
