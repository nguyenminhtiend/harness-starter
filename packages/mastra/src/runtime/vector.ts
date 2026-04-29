import { LibSQLVector } from '@mastra/libsql';
import { defaultRepoDbUrl } from './storage.ts';

type RepoFinder = (startDir: string) => string | undefined;

export interface CreateMastraVectorOptions {
  url?: string;
  /** @internal inject a fake finder in tests to bypass fs walking */
  _repoFinder?: RepoFinder;
}

export function createMastraVector(opts?: CreateMastraVectorOptions): LibSQLVector {
  const url = opts?.url ?? process.env.MASTRA_DB_URL ?? defaultRepoDbUrl(opts?._repoFinder);
  return new LibSQLVector({ id: 'mastra-vector', url });
}
