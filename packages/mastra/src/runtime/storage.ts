import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibSQLStore } from '@mastra/libsql';

type RepoFinder = (startDir: string) => string | undefined;

let cachedDbUrl: string | undefined;

function defaultRepoFinder(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    if (
      existsSync(join(dir, 'bun.lock')) ||
      existsSync(join(dir, 'bun.lockb')) ||
      existsSync(join(dir, 'pnpm-workspace.yaml')) ||
      existsSync(join(dir, 'biome.json'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Resolves the repo-root-relative LibSQL URL. Caches the result when using
 * the default finder so repeated calls are free at runtime.
 */
export function defaultRepoDbUrl(finder?: RepoFinder): string {
  if (!finder) {
    if (cachedDbUrl) {
      return cachedDbUrl;
    }
    const url = computeDbUrl(defaultRepoFinder);
    cachedDbUrl = url;
    return url;
  }
  return computeDbUrl(finder);
}

function computeDbUrl(finder: RepoFinder): string {
  const startDir = dirname(fileURLToPath(import.meta.url));
  const root = finder(startDir);
  if (!root) {
    throw new Error('Could not resolve repo root from runtime path');
  }
  return `file:${join(root, '.mastra', 'mastra.db')}`;
}

export interface CreateMastraStorageOptions {
  url?: string;
  /** @internal inject a fake finder in tests to bypass fs walking */
  _repoFinder?: RepoFinder;
}

export function createMastraStorage(opts?: CreateMastraStorageOptions): LibSQLStore {
  const url = opts?.url ?? process.env.MASTRA_DB_URL ?? defaultRepoDbUrl(opts?._repoFinder);
  return new LibSQLStore({ id: 'mastra-storage', url });
}
