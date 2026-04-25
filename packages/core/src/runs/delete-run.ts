import type { EventLog } from '../storage/memory/event-log.ts';
import type { RunStore } from '../storage/memory/run-store.ts';

export interface DeleteRunDeps {
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
}

export async function deleteRun(deps: DeleteRunDeps, runId: string): Promise<void> {
  await deps.eventLog.deleteByRunId(runId);
  await deps.runStore.delete(runId);
}
