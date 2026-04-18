import { parseCliArgs } from './args.ts';
import { discoverEvalFiles } from './discover.ts';
import { runExports } from './export.ts';
import { runMatrix } from './matrix.ts';
import { generateHtmlReport } from './report.ts';
import { writeJsonlResults } from './results.ts';
import { runSingleEval } from './runner.ts';
import type { EvalRunResult } from './types.ts';

const USAGE = `
harness-eval — run eval suites across a model matrix

Usage:
  harness-eval <glob>             Run evals matching <glob>
  harness-eval [options] <glob>

Options:
  --models, -m <list>       Comma-separated model names (fans out per model)
  --concurrency, -c <n>     Max parallel eval runs (default: 1)
  --export, -e <list>       Comma-separated export adapters: inspect, langfuse
  --output, -o <dir>        Output directory (default: .harness/reports)
  --score-threshold <n>     Fail if average score below threshold (0-100)
  --help, -h                Show this help

Examples:
  harness-eval "packages/**/*.eval.ts"
  harness-eval --models gpt-4o,claude-sonnet --concurrency 4 "**/*.eval.ts"
  harness-eval --export inspect,langfuse "evals/**/*.eval.ts"

Environment:
  HARNESS_EVAL_MODEL  Set by the CLI for each model in the matrix.
                      Read this in your eval files to configure the provider.
`.trim();

async function main(): Promise<void> {
  const config = parseCliArgs(process.argv.slice(2));

  if (config.help) {
    console.log(USAGE);
    process.exit(0);
  }

  console.log(`Discovering eval files: ${config.pattern}`);
  const files = await discoverEvalFiles(config.pattern, process.cwd());
  console.log(`Found ${files.length} eval file${files.length !== 1 ? 's' : ''}`);

  if (config.models.length > 0) {
    console.log(`Models: ${config.models.join(', ')}`);
  }
  console.log(`Concurrency: ${config.concurrency}`);

  let evaliteRunner: ((opts: { outputPath?: string }) => Promise<void>) | undefined;
  try {
    // @ts-expect-error — evalite is an optional runtime dependency
    const mod = await import('evalite/runner');
    evaliteRunner = mod.runEvalite;
  } catch {
    console.log('evalite not installed — using no-op runner');
  }

  const effectiveConcurrency = config.models.length > 1 ? 1 : config.concurrency;
  if (effectiveConcurrency !== config.concurrency) {
    console.log(`Forcing concurrency=1 (multiple models share process.env.HARNESS_EVAL_MODEL)`);
  }

  const tmpDir = `${config.outputDir}/.tmp-${Date.now()}`;

  const result = await runMatrix({
    files,
    models: [...config.models],
    concurrency: effectiveConcurrency,
    runEval: async (opts: { file: string; model: string | undefined }): Promise<EvalRunResult> => {
      if (evaliteRunner) {
        return runSingleEval({ ...opts, tmpDir, evaliteRunner });
      }
      return {
        file: opts.file,
        model: opts.model,
        scores: [],
        averageScore: 0,
        durationMs: 0,
        error: 'evalite not available',
        timestamp: new Date().toISOString(),
      };
    },
  });

  try {
    const { rmSync } = await import('node:fs');
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  console.log(`\nCompleted ${result.results.length} eval run(s) in ${result.totalDurationMs}ms`);

  const outputDir = await writeJsonlResults(result.results, config.outputDir);
  await generateHtmlReport(result.results, outputDir);

  console.log(`Results:  ${outputDir}/results.jsonl`);
  console.log(`Report:   ${outputDir}/report.html`);

  if (config.exportAdapters.length > 0) {
    console.log(`\nRunning exports: ${config.exportAdapters.join(', ')}`);
    const reports = await runExports({
      results: result.results,
      adapters: config.exportAdapters,
      outputDir,
    });
    for (const r of reports) {
      console.log(`  ${r.adapter}: ${r.success ? 'ok' : `failed — ${r.error}`}`);
    }
  }

  if (config.scoreThreshold != null) {
    if (result.results.length === 0) {
      console.log('\nNo eval results to check against threshold — skipping');
    }
    const avgScore =
      result.results.length > 0
        ? result.results.reduce((s, r) => s + r.averageScore, 0) / result.results.length
        : 0;
    const pct = avgScore * 100;
    if (result.results.length > 0 && pct < config.scoreThreshold) {
      console.log(
        `\nScore ${pct.toFixed(1)}% below threshold ${config.scoreThreshold}% — exiting with code 1`,
      );
      process.exit(1);
    }
  }

  const failures = result.results.filter((r) => r.error != null);
  if (failures.length > 0) {
    console.log(`\n${failures.length} eval(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
