import type { ApprovalDecision, ApprovalResolver } from './types.ts';

export interface ApprovalRegistry {
  resolver: ApprovalResolver;
  waitForApproval(approvalId: string, toolName: string, args: unknown): Promise<ApprovalDecision>;
}

export function createApprovalRegistry(): ApprovalRegistry {
  const pending = new Map<string, { resolve: (decision: ApprovalDecision) => void }>();

  const resolver: ApprovalResolver = {
    resolve(approvalId: string, decision: ApprovalDecision): void {
      const entry = pending.get(approvalId);
      if (entry) {
        entry.resolve(decision);
        pending.delete(approvalId);
      }
    },
  };

  async function waitForApproval(
    approvalId: string,
    _toolName: string,
    _args: unknown,
  ): Promise<ApprovalDecision> {
    return new Promise<ApprovalDecision>((resolve) => {
      pending.set(approvalId, { resolve });
    });
  }

  return { resolver, waitForApproval };
}
