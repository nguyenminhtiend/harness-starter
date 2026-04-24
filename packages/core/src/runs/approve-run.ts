import type { ApprovalDecision } from '../domain/approval.ts';
import { ConflictError, NotFoundError } from '../domain/errors.ts';
import type { ApprovalQueue } from '../storage/inmem-approval-queue.ts';
import type { ApprovalStore } from '../storage/inmem-approval-store.ts';
import type { RunStore } from '../storage/inmem-run-store.ts';
import type { Clock } from '../time/clock.ts';

export interface ApproveRunDeps {
  readonly runStore: RunStore;
  readonly approvalStore: ApprovalStore;
  readonly approvalQueue?: ApprovalQueue | undefined;
  readonly clock: Clock;
}

export async function approveRun(
  deps: ApproveRunDeps,
  runId: string,
  approvalId: string,
  decision: ApprovalDecision,
): Promise<void> {
  const run = await deps.runStore.get(runId);
  if (!run) {
    throw new NotFoundError('Run', runId);
  }

  const approval = await deps.approvalStore.get(approvalId);
  if (!approval || approval.runId !== runId) {
    throw new NotFoundError('Approval', approvalId);
  }

  if (approval.status !== 'pending') {
    throw new ConflictError(`Approval '${approvalId}' is already resolved`);
  }

  if (deps.approvalQueue) {
    await deps.approvalQueue.resolve(approvalId, decision, deps.clock.now());
  } else {
    await deps.approvalStore.resolve(approvalId, decision, deps.clock.now());
  }
}
