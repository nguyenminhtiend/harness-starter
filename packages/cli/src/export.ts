import { ValidationError } from '@harness/core';
import type { EvalRunResult } from './types.ts';

const KNOWN_ADAPTERS = new Set(['inspect', 'langfuse']);

export interface ExportReport {
  readonly adapter: string;
  readonly success: boolean;
  readonly error: string | undefined;
}

interface RunExportsOpts {
  results: readonly EvalRunResult[];
  adapters: readonly string[];
  outputDir: string;
}

export async function runExports(opts: RunExportsOpts): Promise<ExportReport[]> {
  const { results, adapters, outputDir } = opts;

  if (adapters.length === 0) {
    return [];
  }

  for (const name of adapters) {
    if (!KNOWN_ADAPTERS.has(name)) {
      throw new ValidationError(
        `Unknown export adapter: "${name}". Available: ${[...KNOWN_ADAPTERS].join(', ')}`,
        { zodIssues: null },
      );
    }
  }

  const reports: ExportReport[] = [];
  for (const adapter of adapters) {
    try {
      await runAdapter(adapter, results, outputDir);
      reports.push({ adapter, success: true, error: undefined });
    } catch (err) {
      reports.push({
        adapter,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return reports;
}

async function runAdapter(
  adapter: string,
  results: readonly EvalRunResult[],
  outputDir: string,
): Promise<void> {
  switch (adapter) {
    case 'inspect':
      await runInspectExport(results, outputDir);
      break;
    case 'langfuse':
      await runLangfuseExport(results);
      break;
  }
}

async function loadEvalPackage(): Promise<Record<string, unknown> | null> {
  try {
    // @ts-expect-error — @harness/eval may not be installed yet (Phase 7)
    return await import('@harness/eval');
  } catch {
    return null;
  }
}

async function runInspectExport(
  results: readonly EvalRunResult[],
  _outputDir: string,
): Promise<void> {
  const evalPkg = await loadEvalPackage();
  if (!evalPkg) {
    console.log('[export:inspect] @harness/eval not available — skipping Inspect-AI export');
    return;
  }
  if (typeof evalPkg.toInspectLog === 'function') {
    await (evalPkg.toInspectLog as (r: readonly EvalRunResult[]) => Promise<void>)(results);
  }
}

async function runLangfuseExport(results: readonly EvalRunResult[]): Promise<void> {
  const evalPkg = await loadEvalPackage();
  if (!evalPkg) {
    console.log('[export:langfuse] @harness/eval not available — skipping Langfuse export');
    return;
  }
  if (typeof evalPkg.toLangfuse === 'function') {
    await (evalPkg.toLangfuse as (r: readonly EvalRunResult[]) => Promise<void>)(results);
  }
}
