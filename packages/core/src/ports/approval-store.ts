import type { ApprovalDecision, PendingApproval } from '../domain/approval.ts';

export interface ApprovalStore {
  createPending(approval: PendingApproval): Promise<void>;
  resolve(id: string, decision: ApprovalDecision, resolvedAt: string): Promise<void>;
  get(id: string): Promise<PendingApproval | undefined>;
  listPending(runId: string): Promise<PendingApproval[]>;
}
