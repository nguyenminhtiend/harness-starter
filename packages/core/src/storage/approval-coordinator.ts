import type { ApprovalDecision, PendingApproval } from '../domain/approval.ts';

export interface ApprovalCoordinator {
  createPending(approval: PendingApproval): Promise<void>;
  request(
    approvalId: string,
    runId: string,
    payload: unknown,
    createdAt: string,
  ): Promise<ApprovalDecision>;
  resolve(id: string, decision: ApprovalDecision, resolvedAt: string): Promise<void>;
  get(id: string): Promise<PendingApproval | undefined>;
  listPending(runId: string): Promise<PendingApproval[]>;
}

export function createInMemoryApprovalCoordinator(): ApprovalCoordinator {
  const approvals = new Map<string, PendingApproval>();
  const waiters = new Map<string, (decision: ApprovalDecision) => void>();
  const earlyDecisions = new Map<string, ApprovalDecision>();

  return {
    async createPending(approval) {
      approvals.set(approval.id, approval);
    },

    async request(approvalId, runId, payload, createdAt) {
      if (waiters.has(approvalId)) {
        throw new Error(`Duplicate approval request for id '${approvalId}'`);
      }

      const promise = new Promise<ApprovalDecision>((resolve) => {
        waiters.set(approvalId, resolve);
      });

      approvals.set(approvalId, {
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

    async resolve(id, decision, resolvedAt) {
      const existing = approvals.get(id);
      if (existing) {
        approvals.set(id, { ...existing, status: 'resolved', decision, resolvedAt });
      }

      const waiter = waiters.get(id);
      if (waiter) {
        waiters.delete(id);
        waiter(decision);
      } else {
        earlyDecisions.set(id, decision);
      }
    },

    async get(id) {
      return approvals.get(id);
    },

    async listPending(runId) {
      return [...approvals.values()].filter((a) => a.runId === runId && a.status === 'pending');
    },
  };
}
