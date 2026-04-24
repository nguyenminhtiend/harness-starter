import { z } from 'zod';

export const ApprovalDecision = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('approve'), editedPlan: z.unknown().optional() }),
  z.object({ kind: z.literal('reject'), reason: z.string().optional() }),
]);

export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export type ApprovalStatus = 'pending' | 'resolved';

export interface PendingApproval {
  readonly id: string;
  readonly runId: string;
  readonly payload: unknown;
  readonly status: ApprovalStatus;
  readonly createdAt: string;
  readonly decision?: ApprovalDecision | undefined;
  readonly resolvedAt?: string | undefined;
}

export interface ApprovalRequester {
  request(approvalId: string, payload: unknown): Promise<ApprovalDecision>;
}
