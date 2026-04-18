import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRunResult } from './types.ts';

export async function writeJsonlResults(
  results: readonly EvalRunResult[],
  baseDir: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = join(baseDir, timestamp);
  mkdirSync(outputDir, { recursive: true });

  const lines = results.map((r) => JSON.stringify(r));
  const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  writeFileSync(join(outputDir, 'results.jsonl'), content);

  return outputDir;
}

/** Parses JSONL from a trusted local file. Malformed lines are skipped. */
export async function readJsonlResults(path: string): Promise<EvalRunResult[]> {
  const content = await Bun.file(path).text();
  if (!content.trim()) {
    return [];
  }
  const results: EvalRunResult[] = [];
  for (const line of content.trim().split('\n')) {
    try {
      const parsed = JSON.parse(line) as EvalRunResult;
      if (typeof parsed.file === 'string' && typeof parsed.averageScore === 'number') {
        results.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }
  return results;
}
