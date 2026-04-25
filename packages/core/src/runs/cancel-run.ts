import { NotFoundError } from '../domain/errors.ts';
import type { RunStore } from '../storage/memory/run-store.ts';

export interface CancelRunDeps {
  readonly runStore: RunStore;
}

export async function cancelRun(
  deps: CancelRunDeps,
  runId: string,
  abortController: AbortController,
): Promise<void> {
  const run = await deps.runStore.get(runId);
  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  abortController.abort();
}
