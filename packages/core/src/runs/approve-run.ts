import type { ApprovalDecision } from '../domain/approval.ts';
import { ConflictError, NotFoundError } from '../domain/errors.ts';
import type { ApprovalCoordinator } from '../storage/memory/approval-coordinator.ts';
import type { RunStore } from '../storage/memory/run-store.ts';
import type { Clock } from '../time/clock.ts';

export interface ApproveRunDeps {
  readonly runStore: RunStore;
  readonly approvalCoordinator: ApprovalCoordinator;
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

  const approval = await deps.approvalCoordinator.get(approvalId);
  if (!approval || approval.runId !== runId) {
    throw new NotFoundError('Approval', approvalId);
  }

  if (approval.status !== 'pending') {
    throw new ConflictError(`Approval '${approvalId}' is already resolved`);
  }

  await deps.approvalCoordinator.resolve(approvalId, decision, deps.clock.now());
}
