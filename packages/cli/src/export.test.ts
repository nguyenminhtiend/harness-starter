import { describe, expect, it } from 'bun:test';
import { ValidationError } from '@harness/core';
import { runExports } from './export.ts';
import type { EvalRunResult } from './types.ts';

const sampleResults: EvalRunResult[] = [
  {
    file: '/a.eval.ts',
    model: 'gpt-4o',
    scores: [{ name: 'exact', score: 1 }],
    averageScore: 1,
    durationMs: 100,
    error: undefined,
    timestamp: '2026-04-18T00:00:00.000Z',
  },
];

describe('runExports', () => {
  it('throws ValidationError for unknown adapter name', async () => {
    await expect(
      runExports({
        results: sampleResults,
        adapters: ['nonexistent'],
        outputDir: '/tmp/test',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('accepts known adapter names without throwing', async () => {
    const report = await runExports({
      results: sampleResults,
      adapters: ['inspect', 'langfuse'],
      outputDir: '/tmp/test',
    });
    expect(report).toBeDefined();
    expect(report.length).toBe(2);
  });

  it('reports each adapter result with status', async () => {
    const report = await runExports({
      results: sampleResults,
      adapters: ['inspect'],
      outputDir: '/tmp/test',
    });
    expect(report[0]?.adapter).toBe('inspect');
    expect(typeof report[0]?.success).toBe('boolean');
  });

  it('one adapter failure does not block others', async () => {
    const report = await runExports({
      results: sampleResults,
      adapters: ['inspect', 'langfuse'],
      outputDir: '/tmp/test',
    });
    expect(report).toHaveLength(2);
  });

  it('returns empty array for empty adapter list', async () => {
    const report = await runExports({
      results: sampleResults,
      adapters: [],
      outputDir: '/tmp/test',
    });
    expect(report).toEqual([]);
  });
});
