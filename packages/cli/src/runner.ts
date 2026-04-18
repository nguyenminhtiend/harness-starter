import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRunResult, ScoreEntry } from './types.ts';

export type EvaliteRunner = (opts: {
  path?: string;
  mode?: string;
  outputPath?: string;
  hideTable?: boolean;
  disableServer?: boolean;
}) => Promise<void>;

interface RunSingleEvalOpts {
  file: string;
  model: string | undefined;
  tmpDir: string;
  evaliteRunner: EvaliteRunner;
}

export async function runSingleEval(opts: RunSingleEvalOpts): Promise<EvalRunResult> {
  const { file, model, tmpDir, evaliteRunner } = opts;
  const outputPath = join(
    tmpDir,
    `evalite-output-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  const start = performance.now();
  const prevModel = process.env.HARNESS_EVAL_MODEL;

  try {
    if (model != null) {
      process.env.HARNESS_EVAL_MODEL = model;
    }

    await evaliteRunner({
      path: file,
      mode: 'run-once-and-exit',
      outputPath,
      hideTable: true,
      disableServer: true,
    });

    const scores = readScores(outputPath);
    const durationMs = Math.round(performance.now() - start);

    return {
      file,
      model,
      scores,
      averageScore: scores.length > 0 ? scores.reduce((s, e) => s + e.score, 0) / scores.length : 0,
      durationMs,
      error: undefined,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    return {
      file,
      model,
      scores: [],
      averageScore: 0,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (model != null) {
      if (prevModel != null) {
        process.env.HARNESS_EVAL_MODEL = prevModel;
      } else {
        delete process.env.HARNESS_EVAL_MODEL;
      }
    }
    try {
      unlinkSync(outputPath);
    } catch {
      // file may not exist if evalite crashed before writing
    }
  }
}

function readScores(outputPath: string): ScoreEntry[] {
  try {
    const raw = readFileSync(outputPath, 'utf-8');
    const data = JSON.parse(raw) as {
      results?: Array<{ scores?: Array<{ name: string; score: number }> }>;
    };
    if (!data.results?.length) {
      return [];
    }
    const allScores: ScoreEntry[] = [];
    for (const result of data.results) {
      if (result.scores) {
        for (const s of result.scores) {
          allScores.push({ name: s.name, score: s.score });
        }
      }
    }
    return allScores;
  } catch {
    return [];
  }
}
