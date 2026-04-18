import { resolve } from 'node:path';
import { ValidationError } from '@harness/core';

export async function discoverEvalFiles(pattern: string, cwd: string): Promise<string[]> {
  const glob = new Bun.Glob(pattern);
  const matches: string[] = [];

  for await (const match of glob.scan({ cwd, absolute: true })) {
    if (match.split('/').includes('node_modules') || match.split('\\').includes('node_modules')) {
      continue;
    }
    matches.push(resolve(match));
  }

  if (matches.length === 0) {
    throw new ValidationError(`No eval files found matching pattern: "${pattern}"`, {
      zodIssues: null,
    });
  }

  return matches.sort();
}
