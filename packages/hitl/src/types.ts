import type { Checkpointer } from '@harness/agent';

export interface ApprovalDecision {
  decision: 'approve' | 'reject';
  editedPlan?: unknown;
}

export interface HitlRunSession {
  checkpointer: Checkpointer;
  abortController: AbortController;
}
