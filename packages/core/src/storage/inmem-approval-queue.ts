import type { ApprovalDecision } from '../domain/approval.ts';
import type { ApprovalStore } from './inmem-approval-store.ts';

export interface ApprovalQueue {
  request(
    approvalId: string,
    runId: string,
    payload: unknown,
    createdAt: string,
  ): Promise<ApprovalDecision>;
  resolve(approvalId: string, decision: ApprovalDecision, resolvedAt: string): Promise<void>;
}

export function createInMemoryApprovalQueue(store: ApprovalStore): ApprovalQueue {
  const waiters = new Map<string, (decision: ApprovalDecision) => void>();
  const earlyDecisions = new Map<string, ApprovalDecision>();

  return {
    async request(approvalId, runId, payload, createdAt) {
      if (waiters.has(approvalId)) {
        throw new Error(`Duplicate approval request for id '${approvalId}'`);
      }

      const promise = new Promise<ApprovalDecision>((resolve) => {
        waiters.set(approvalId, resolve);
      });

      await store.createPending({
        id: approvalId,
        runId,
        payload,
        status: 'pending',
        createdAt,
      });

      const early = earlyDecisions.get(approvalId);
      if (early) {
        earlyDecisions.delete(approvalId);
        const waiter = waiters.get(approvalId);
        if (waiter) {
          waiters.delete(approvalId);
          waiter(early);
        }
      }

      return promise;
    },

    async resolve(approvalId, decision, resolvedAt) {
      await store.resolve(approvalId, decision, resolvedAt);

      const waiter = waiters.get(approvalId);
      if (waiter) {
        waiters.delete(approvalId);
        waiter(decision);
      } else {
        earlyDecisions.set(approvalId, decision);
      }
    },
  };
}
