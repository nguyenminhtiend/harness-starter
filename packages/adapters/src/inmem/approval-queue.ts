import type { ApprovalDecision, ApprovalQueue, ApprovalStore } from '@harness/core';

export function createInMemoryApprovalQueue(store: ApprovalStore): ApprovalQueue {
  const waiters = new Map<string, (decision: ApprovalDecision) => void>();

  return {
    async request(approvalId, runId, payload, createdAt) {
      await store.createPending({
        id: approvalId,
        runId,
        payload,
        status: 'pending',
        createdAt,
      });

      return new Promise<ApprovalDecision>((resolve) => {
        waiters.set(approvalId, resolve);
      });
    },

    async resolve(approvalId, decision, resolvedAt) {
      await store.resolve(approvalId, decision, resolvedAt);

      const waiter = waiters.get(approvalId);
      if (waiter) {
        waiters.delete(approvalId);
        waiter(decision);
      }
    },
  };
}
