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

export async function readJsonlResults(path: string): Promise<EvalRunResult[]> {
  const content = await Bun.file(path).text();
  if (!content.trim()) {
    return [];
  }
  return content
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as EvalRunResult);
}
