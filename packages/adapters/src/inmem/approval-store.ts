import type { ApprovalDecision, ApprovalStore, PendingApproval } from '@harness/core';

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
