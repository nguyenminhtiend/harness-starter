export interface HitlPlanDecision {
  decision: 'approve' | 'reject';
  editedPlan?: unknown;
}

export interface ApprovalStore {
  hasPending(runId: string): boolean;
  waitFor(runId: string): Promise<HitlPlanDecision>;
  resolve(runId: string, decision: HitlPlanDecision): boolean;
}

export function createApprovalStore(): ApprovalStore {
  const resolvers = new Map<string, { resolve: (value: HitlPlanDecision) => void }>();

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
