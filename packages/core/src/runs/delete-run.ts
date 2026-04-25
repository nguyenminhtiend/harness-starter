import type { EventLog } from '../storage/event-log.ts';
import type { RunStore } from '../storage/run-store.ts';

export interface DeleteRunDeps {
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
}

export async function deleteRun(deps: DeleteRunDeps, runId: string): Promise<void> {
  await deps.eventLog.deleteByRunId(runId);
  await deps.runStore.delete(runId);
}
