import type { ApprovalDecision, PendingApproval } from '../../domain/approval.ts';

export interface ApprovalStore {
  createPending(approval: PendingApproval): Promise<void>;
  resolve(id: string, decision: ApprovalDecision, resolvedAt: string): Promise<void>;
  get(id: string): Promise<PendingApproval | undefined>;
  listPending(runId: string): Promise<PendingApproval[]>;
}

export function createInMemoryApprovalStore(): ApprovalStore {
  const approvals = new Map<string, PendingApproval>();

  return {
    async createPending(approval) {
      approvals.set(approval.id, approval);
    },

    async resolve(id: string, decision: ApprovalDecision, resolvedAt: string) {
      const existing = approvals.get(id);
      if (existing) {
        approvals.set(id, { ...existing, status: 'resolved', decision, resolvedAt });
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
