import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonlResults, writeJsonlResults } from './results.ts';
import type { EvalRunResult } from './types.ts';

const baseDir = join(tmpdir(), `harness-cli-results-test-${Date.now()}`);

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

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
  {
    file: '/b.eval.ts',
    model: 'claude',
    scores: [{ name: 'exact', score: 0.5 }],
    averageScore: 0.5,
    durationMs: 200,
    error: 'boom',
    timestamp: '2026-04-18T00:00:01.000Z',
  },
];

describe('writeJsonlResults', () => {
  it('creates timestamped output directory', async () => {
    const outputDir = await writeJsonlResults(sampleResults, baseDir);
    expect(existsSync(outputDir)).toBe(true);
    expect(outputDir.startsWith(baseDir)).toBe(true);
  });

  it('writes results.jsonl in the output directory', async () => {
    const outputDir = await writeJsonlResults(sampleResults, baseDir);
    const files = readdirSync(outputDir);
    expect(files).toContain('results.jsonl');
  });

  it('writes valid JSONL (one JSON object per line)', async () => {
    const outputDir = await writeJsonlResults(sampleResults, baseDir);
    const content = await Bun.file(join(outputDir, 'results.jsonl')).text();
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('handles empty results', async () => {
    const outputDir = await writeJsonlResults([], baseDir);
    const content = await Bun.file(join(outputDir, 'results.jsonl')).text();
    expect(content).toBe('');
  });

  it('returns the output directory path', async () => {
    const outputDir = await writeJsonlResults(sampleResults, baseDir);
    expect(typeof outputDir).toBe('string');
  });
});

describe('readJsonlResults', () => {
  it('round-trips: read recovers written data', async () => {
    const outputDir = await writeJsonlResults(sampleResults, baseDir);
    const recovered = await readJsonlResults(join(outputDir, 'results.jsonl'));
    expect(recovered).toHaveLength(2);
    expect(recovered[0]?.file).toBe('/a.eval.ts');
    expect(recovered[0]?.model).toBe('gpt-4o');
    expect(recovered[1]?.error).toBe('boom');
  });
});
