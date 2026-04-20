export interface HitlPlanDecision {
  decision: 'approve' | 'reject';
  editedPlan?: unknown;
}

const approvalResolvers = new Map<string, { resolve: (value: HitlPlanDecision) => void }>();

export function hasPendingApproval(runId: string): boolean {
  return approvalResolvers.has(runId);
}

export function waitForApproval(runId: string): Promise<HitlPlanDecision> {
  return new Promise((resolve) => {
    approvalResolvers.set(runId, { resolve });
  });
}

export function resolveApproval(runId: string, decision: HitlPlanDecision): boolean {
  const pending = approvalResolvers.get(runId);
  if (!pending) {
    return false;
  }
  approvalResolvers.delete(runId);
  pending.resolve(decision);
  return true;
}

export const approvalRouteDeps = {
  hasPendingApproval,
  resolveApproval,
} as const;
