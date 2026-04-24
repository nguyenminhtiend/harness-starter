import type { ApprovalDecision } from '../domain/approval.ts';

export interface ApprovalQueue {
  request(
    approvalId: string,
    runId: string,
    payload: unknown,
    createdAt: string,
  ): Promise<ApprovalDecision>;
  resolve(approvalId: string, decision: ApprovalDecision, resolvedAt: string): Promise<void>;
}
