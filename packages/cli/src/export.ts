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
    return await import('@harness/eval');
  } catch {
    return null;
  }
}

function toEvalResults(results: readonly EvalRunResult[]): {
  name: string;
  model?: string | undefined;
  samples: Array<{
    id: string;
    input: unknown;
    output: unknown;
    scores: Record<string, { score: number; metadata?: Record<string, unknown> | undefined }>;
    durationMs?: number | undefined;
  }>;
  createdAt?: string | undefined;
} {
  const first = results[0];
  return {
    name: first?.file ?? 'eval',
    ...(first?.model != null ? { model: first.model } : {}),
    samples: results.map((r, i) => ({
      id: `${r.file}:${r.model ?? 'default'}:${i}`,
      input: r.file,
      output: r.model ?? 'default',
      scores: Object.fromEntries(r.scores.map((s) => [s.name, { score: s.score }])),
      durationMs: r.durationMs,
    })),
    ...(first?.timestamp != null ? { createdAt: first.timestamp } : {}),
  };
}

async function runInspectExport(
  results: readonly EvalRunResult[],
  outputDir: string,
): Promise<void> {
  const evalPkg = await loadEvalPackage();
  if (!evalPkg) {
    console.log('[export:inspect] @harness/eval not available — skipping Inspect-AI export');
    return;
  }
  if (typeof evalPkg.toInspectLog === 'function') {
    const mapped = toEvalResults(results);
    const log = (evalPkg.toInspectLog as (r: typeof mapped) => unknown)(mapped);
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(`${outputDir}/inspect-log.json`, JSON.stringify(log, null, 2), 'utf8');
  }
}

async function runLangfuseExport(results: readonly EvalRunResult[]): Promise<void> {
  const evalPkg = await loadEvalPackage();
  if (!evalPkg) {
    console.log('[export:langfuse] @harness/eval not available — skipping Langfuse export');
    return;
  }
  if (typeof evalPkg.toLangfuse !== 'function') {
    return;
  }
  let langfuseClient: unknown;
  try {
    // @ts-expect-error — langfuse is an optional peer dependency
    const langfuse = await import('langfuse');
    langfuseClient = new (langfuse as { Langfuse: new () => unknown }).Langfuse();
  } catch {
    console.log('[export:langfuse] langfuse package not installed — skipping');
    return;
  }
  const mapped = toEvalResults(results);
  (evalPkg.toLangfuse as (r: typeof mapped, client: unknown) => void)(mapped, langfuseClient);
}
