import type { EvalRunResult, MatrixResult } from './types.ts';

type RunEvalFn = (opts: { file: string; model: string | undefined }) => Promise<EvalRunResult>;

interface RunMatrixOpts {
  files: readonly string[];
  models: readonly string[];
  concurrency: number;
  runEval: RunEvalFn;
}

export async function runMatrix(opts: RunMatrixOpts): Promise<MatrixResult> {
  const { files, models, concurrency, runEval } = opts;
  const start = performance.now();

  const jobs: Array<{ file: string; model: string | undefined }> = [];
  if (models.length === 0) {
    for (const file of files) {
      jobs.push({ file, model: undefined });
    }
  } else {
    for (const model of models) {
      for (const file of files) {
        jobs.push({ file, model });
      }
    }
  }

  const results = await pooled(jobs, concurrency, (job) => runEval(job));

  return {
    results,
    totalDurationMs: Math.round(performance.now() - start),
    models: [...models],
    files: [...files],
  };
}

async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]!);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
