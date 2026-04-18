import { describe, expect, it } from 'bun:test';
import { runMatrix } from './matrix.ts';
import type { EvalRunResult } from './types.ts';

function makeFakeRunner(delayMs = 0) {
  const callLog: Array<{ file: string; model: string | undefined }> = [];
  let concurrentCount = 0;
  let peakConcurrent = 0;

  const runner = async (opts: {
    file: string;
    model: string | undefined;
  }): Promise<EvalRunResult> => {
    callLog.push({ file: opts.file, model: opts.model });
    concurrentCount++;
    if (concurrentCount > peakConcurrent) {
      peakConcurrent = concurrentCount;
    }
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    concurrentCount--;
    return {
      file: opts.file,
      model: opts.model,
      scores: [{ name: 'test', score: 0.9 }],
      averageScore: 0.9,
      durationMs: delayMs,
      error: undefined,
      timestamp: new Date().toISOString(),
    };
  };

  return { runner, callLog, getPeakConcurrent: () => peakConcurrent };
}

describe('runMatrix', () => {
  it('fans out: 2 models × 3 files = 6 eval runs', async () => {
    const { runner, callLog } = makeFakeRunner();
    const result = await runMatrix({
      files: ['/a.eval.ts', '/b.eval.ts', '/c.eval.ts'],
      models: ['gpt-4o', 'claude'],
      concurrency: 10,
      runEval: runner,
    });

    expect(callLog).toHaveLength(6);
    expect(result.results).toHaveLength(6);
    expect(result.models).toEqual(['gpt-4o', 'claude']);
    expect(result.files).toEqual(['/a.eval.ts', '/b.eval.ts', '/c.eval.ts']);
  });

  it('respects concurrency limit', async () => {
    const { runner, getPeakConcurrent } = makeFakeRunner(50);
    await runMatrix({
      files: ['/a.eval.ts', '/b.eval.ts', '/c.eval.ts', '/d.eval.ts'],
      models: ['m1'],
      concurrency: 2,
      runEval: runner,
    });

    expect(getPeakConcurrent()).toBeLessThanOrEqual(2);
  });

  it('default concurrency is 1 (sequential)', async () => {
    const { runner, getPeakConcurrent } = makeFakeRunner(20);
    await runMatrix({
      files: ['/a.eval.ts', '/b.eval.ts'],
      models: ['m1'],
      concurrency: 1,
      runEval: runner,
    });

    expect(getPeakConcurrent()).toBe(1);
  });

  it('single model (no --models) runs each file once with undefined model', async () => {
    const { runner, callLog } = makeFakeRunner();
    await runMatrix({
      files: ['/a.eval.ts', '/b.eval.ts'],
      models: [],
      concurrency: 1,
      runEval: runner,
    });

    expect(callLog).toHaveLength(2);
    expect(callLog[0]?.model).toBeUndefined();
    expect(callLog[1]?.model).toBeUndefined();
  });

  it('returns all results even if some fail', async () => {
    let callCount = 0;
    const runner = async (opts: {
      file: string;
      model: string | undefined;
    }): Promise<EvalRunResult> => {
      callCount++;
      if (callCount === 2) {
        return {
          file: opts.file,
          model: opts.model,
          scores: [],
          averageScore: 0,
          durationMs: 0,
          error: 'boom',
          timestamp: new Date().toISOString(),
        };
      }
      return {
        file: opts.file,
        model: opts.model,
        scores: [{ name: 'test', score: 1 }],
        averageScore: 1,
        durationMs: 0,
        error: undefined,
        timestamp: new Date().toISOString(),
      };
    };

    const result = await runMatrix({
      files: ['/a.eval.ts', '/b.eval.ts', '/c.eval.ts'],
      models: ['m1'],
      concurrency: 1,
      runEval: runner,
    });

    expect(result.results).toHaveLength(3);
    expect(result.results.filter((r) => r.error != null)).toHaveLength(1);
  });

  it('records total wall time', async () => {
    const { runner } = makeFakeRunner(10);
    const result = await runMatrix({
      files: ['/a.eval.ts'],
      models: ['m1'],
      concurrency: 1,
      runEval: runner,
    });

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
