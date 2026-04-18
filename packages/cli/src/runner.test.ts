import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSingleEval } from './runner.ts';

const tmpDir = join(tmpdir(), `harness-cli-runner-test-${Date.now()}`);

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleEvaliteOutput = {
  results: [
    {
      name: 'my-eval',
      scores: [
        { name: 'exactMatch', score: 1 },
        { name: 'includes', score: 0.8 },
      ],
    },
  ],
};

function fakeRunEvalite(outputToWrite: unknown) {
  return async (opts: { outputPath?: string }) => {
    if (opts.outputPath) {
      mkdirSync(join(tmpDir, 'eval-out'), { recursive: true });
      writeFileSync(opts.outputPath, JSON.stringify(outputToWrite));
    }
  };
}

describe('runSingleEval', () => {
  it('sets HARNESS_EVAL_MODEL env var during run and restores after', async () => {
    const originalVal = process.env.HARNESS_EVAL_MODEL;
    let capturedModel: string | undefined;

    const runner = fakeRunEvalite(sampleEvaliteOutput);
    const wrappedRunner = async (opts: { outputPath?: string }) => {
      capturedModel = process.env.HARNESS_EVAL_MODEL;
      return runner(opts);
    };

    await runSingleEval({
      file: '/tmp/test.eval.ts',
      model: 'gpt-4o',
      tmpDir,
      evaliteRunner: wrappedRunner,
    });

    expect(capturedModel).toBe('gpt-4o');
    expect(process.env.HARNESS_EVAL_MODEL).toBe(originalVal);
  });

  it('returns EvalRunResult with scores from evalite output', async () => {
    const result = await runSingleEval({
      file: '/tmp/test.eval.ts',
      model: 'gpt-4o',
      tmpDir,
      evaliteRunner: fakeRunEvalite(sampleEvaliteOutput),
    });

    expect(result.file).toBe('/tmp/test.eval.ts');
    expect(result.model).toBe('gpt-4o');
    expect(result.scores).toEqual([
      { name: 'exactMatch', score: 1 },
      { name: 'includes', score: 0.8 },
    ]);
    expect(result.averageScore).toBe(0.9);
    expect(result.error).toBeUndefined();
  });

  it('returns error result when evalite throws', async () => {
    const failingRunner = async () => {
      throw new Error('evalite crashed');
    };

    const result = await runSingleEval({
      file: '/tmp/test.eval.ts',
      model: 'claude-sonnet',
      tmpDir,
      evaliteRunner: failingRunner,
    });

    expect(result.error).toBe('evalite crashed');
    expect(result.scores).toEqual([]);
    expect(result.averageScore).toBe(0);
  });

  it('works without a model (undefined)', async () => {
    const result = await runSingleEval({
      file: '/tmp/test.eval.ts',
      model: undefined,
      tmpDir,
      evaliteRunner: fakeRunEvalite(sampleEvaliteOutput),
    });

    expect(result.model).toBeUndefined();
  });

  it('records duration', async () => {
    const result = await runSingleEval({
      file: '/tmp/test.eval.ts',
      model: 'gpt-4o',
      tmpDir,
      evaliteRunner: fakeRunEvalite(sampleEvaliteOutput),
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeTruthy();
  });
});
