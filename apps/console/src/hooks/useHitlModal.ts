import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client.ts';

interface HitlModalState {
  open: boolean;
  plan: unknown;
  initialPlan: unknown;
  approvalId: string | null;
}

const CLOSED: HitlModalState = {
  open: false,
  plan: null,
  initialPlan: null,
  approvalId: null,
};

export function useHitlModal(
  runId: string | null,
  onToast: (msg: string) => void,
): {
  hitl: { open: boolean; plan: unknown; approvalId: string | null; initialPlan: unknown };
  onApprovalRequested: (event: { approvalId: string; payload: unknown }) => void;
  approve: (approvedPlan: unknown) => Promise<void>;
  reject: () => Promise<void>;
} {
  const [hitl, setHitl] = useState<HitlModalState>(CLOSED);
  const prevRunRef = useRef(runId);
  if (prevRunRef.current !== runId) {
    prevRunRef.current = runId;
    setHitl(CLOSED);
  }

  const onApprovalRequested = useCallback((event: { approvalId: string; payload: unknown }) => {
    setHitl({
      open: true,
      plan: event.payload,
      initialPlan: event.payload,
      approvalId: event.approvalId,
    });
  }, []);

  const reject = useCallback(async () => {
    const approvalId = hitl.approvalId;
    if (runId && approvalId) {
      await api.rejectRun(runId, { approvalId });
      onToast('Plan approval rejected');
    }
    setHitl(CLOSED);
  }, [runId, hitl.approvalId, onToast]);

  const approve = useCallback(
    async (approvedPlan: unknown) => {
      if (!runId) {
        return;
      }
      const approvalId = hitl.approvalId;
      if (!approvalId) {
        return;
      }
      const planChanged = JSON.stringify(approvedPlan) !== JSON.stringify(hitl.initialPlan);
      await api.approveRun(runId, {
        approvalId,
        ...(planChanged ? { editedPlan: approvedPlan } : {}),
      });
      setHitl(CLOSED);
    },
    [runId, hitl.approvalId, hitl.initialPlan],
  );

  return { hitl, onApprovalRequested, approve, reject };
}
