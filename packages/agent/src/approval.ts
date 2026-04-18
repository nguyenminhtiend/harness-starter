import type { ApprovalDecision, ApprovalResolver } from './types.ts';

export interface ApprovalRegistryOpts {
  timeoutMs?: number;
}

export interface ApprovalRegistry {
  resolver: ApprovalResolver;
  waitForApproval(approvalId: string, toolName: string, args: unknown): Promise<ApprovalDecision>;
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export function createApprovalRegistry(opts?: ApprovalRegistryOpts): ApprovalRegistry {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  const pending = new Map<
    string,
    { resolve: (decision: ApprovalDecision) => void; reject: (err: Error) => void }
  >();

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
    return new Promise<ApprovalDecision>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(approvalId);
        reject(new Error(`Approval timed out after ${timeoutMs}ms (id: ${approvalId})`));
      }, timeoutMs);

      pending.set(approvalId, {
        resolve: (decision) => {
          clearTimeout(timer);
          resolve(decision);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  return { resolver, waitForApproval };
}
