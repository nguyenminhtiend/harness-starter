import { useCallback, useRef, useState } from 'react';
import type { StreamChunk } from '../../shared/events.ts';
import { api } from '../api.ts';

interface HitlModalState {
  open: boolean;
  plan: unknown;
  initialPlan: unknown;
}

const CLOSED: HitlModalState = { open: false, plan: null, initialPlan: null };

export function useHitlModal(sessionId: string | null, onToast: (msg: string) => void) {
  const [hitl, setHitl] = useState<HitlModalState>(CLOSED);
  const prevSessionRef = useRef(sessionId);
  if (prevSessionRef.current !== sessionId) {
    prevSessionRef.current = sessionId;
    setHitl(CLOSED);
  }

  const onHitlRequired = useCallback((chunk: StreamChunk) => {
    setHitl({ open: true, plan: chunk.plan, initialPlan: chunk.plan });
  }, []);

  const reject = useCallback(async () => {
    if (sessionId) {
      await api.approveSession(sessionId, { decision: 'reject' });
      onToast('Plan approval rejected');
    }
    setHitl(CLOSED);
  }, [sessionId, onToast]);

  const approve = useCallback(
    async (approvedPlan: unknown) => {
      if (!sessionId) {
        return;
      }
      const planChanged = JSON.stringify(approvedPlan) !== JSON.stringify(hitl.initialPlan);
      await api.approveSession(sessionId, {
        decision: 'approve',
        ...(planChanged ? { editedPlan: approvedPlan } : {}),
      });
      setHitl(CLOSED);
    },
    [sessionId, hitl.initialPlan],
  );

  return { hitl, onHitlRequired, approve, reject };
}
