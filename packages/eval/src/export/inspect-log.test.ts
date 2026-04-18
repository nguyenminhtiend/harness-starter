import { describe, expect, test } from 'bun:test';
import { toInspectLog } from './inspect-log.ts';
import type { EvalResults } from './types.ts';

const sampleResults: EvalResults = {
  name: 'test-eval',
  model: 'gpt-4o',
  createdAt: '2026-04-18T00:00:00Z',
  samples: [
    {
      id: 's1',
      input: 'What is 2+2?',
      output: '4',
      expected: '4',
      scores: { exactMatch: { score: 1 }, includes: { score: 1 } },
    },
    {
      id: 's2',
      input: 'Capital of France?',
      output: 'London',
      expected: 'Paris',
      scores: { exactMatch: { score: 0 }, includes: { score: 0 } },
    },
    {
      id: 's3',
      input: 'Explain gravity',
      output: 'Gravity is a force',
      expected: 'Gravity is a fundamental force',
      scores: {
        exactMatch: { score: 0 },
        includes: { score: 1 },
        llmJudge: { score: 0.7, metadata: { rationale: 'Partially correct' } },
      },
    },
  ],
};

describe('toInspectLog', () => {
  test('returns correct top-level structure', () => {
    const log = toInspectLog(sampleResults);
    expect(log.version).toBe(2);
    expect(log.status).toBe('success');
    expect(log.eval).toBeDefined();
    expect(log.results).toBeDefined();
    expect(log.samples).toBeDefined();
  });

  test('maps eval metadata', () => {
    const log = toInspectLog(sampleResults);
    expect(log.eval.task).toBe('test-eval');
    expect(log.eval.model).toBe('gpt-4o');
    expect(log.eval.created).toBe('2026-04-18T00:00:00Z');
    expect(log.eval.dataset).toEqual({ name: 'test-eval', samples: 3 });
  });

  test('maps samples with scores', () => {
    const log = toInspectLog(sampleResults);
    expect(log.samples).toHaveLength(3);
    const first = log.samples?.[0];
    expect(first?.id).toBe('s1');
    expect(first?.scores.exactMatch).toEqual({ value: 1 });
  });

  test('includes rationale as explanation', () => {
    const log = toInspectLog(sampleResults);
    const third = log.samples?.[2];
    expect(third?.scores.llmJudge).toEqual({ value: 0.7, explanation: 'Partially correct' });
  });

  test('computes aggregate scores', () => {
    const log = toInspectLog(sampleResults);
    const scores = log.results?.scores;
    const exactMatchAgg = scores?.find((s) => s.name === 'exactMatch');
    expect(exactMatchAgg?.metrics.accuracy.value).toBeCloseTo(1 / 3);
    const includesAgg = scores?.find((s) => s.name === 'includes');
    expect(includesAgg?.metrics.accuracy.value).toBeCloseTo(2 / 3);
  });

  test('uses current date when createdAt not provided', () => {
    const log = toInspectLog({ name: 'x', samples: [] });
    expect(log.eval.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('omits model when not provided', () => {
    const log = toInspectLog({ name: 'x', samples: [] });
    expect(log.eval.model).toBeUndefined();
  });

  test('output is valid JSON', () => {
    const log = toInspectLog(sampleResults);
    const parsed = JSON.parse(JSON.stringify(log));
    expect(parsed.version).toBe(2);
  });
});
