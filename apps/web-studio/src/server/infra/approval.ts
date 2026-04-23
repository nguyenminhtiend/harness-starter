export interface ApprovalDecision {
  decision: 'approve' | 'reject';
  editedPlan?: unknown;
}

export interface ApprovalStore {
  hasPending(runId: string): boolean;
  waitFor(runId: string): Promise<ApprovalDecision>;
  resolve(runId: string, decision: ApprovalDecision): boolean;
}

export function createApprovalStore(): ApprovalStore {
  const resolvers = new Map<string, { resolve: (value: ApprovalDecision) => void }>();

  return {
    hasPending(runId) {
      return resolvers.has(runId);
    },

    waitFor(runId) {
      return new Promise((resolve) => {
        resolvers.set(runId, { resolve });
      });
    },

    resolve(runId, decision) {
      const pending = resolvers.get(runId);
      if (!pending) {
        return false;
      }
      resolvers.delete(runId);
      pending.resolve(decision);
      return true;
    },
  };
}
