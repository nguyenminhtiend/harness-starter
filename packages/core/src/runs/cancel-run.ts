import { NotFoundError } from '../domain/errors.ts';
import type { RunStore } from '../storage/memory/run-store.ts';
import type { RunExecutor } from './run-executor.ts';

export interface CancelRunDeps {
  readonly runStore: RunStore;
  readonly executor: RunExecutor;
}

export async function cancelRun(deps: CancelRunDeps, runId: string): Promise<void> {
  const run = await deps.runStore.get(runId);
  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  deps.executor.abort(runId);
}
