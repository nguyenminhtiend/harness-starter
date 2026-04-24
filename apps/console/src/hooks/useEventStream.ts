import type { RunStatus, SessionEvent } from '@harness/http/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectSSE } from '../api/client.ts';

export type { RunStatus };

export interface UseEventStreamOptions {
  onApprovalRequested?: (event: SessionEvent & { type: 'approval.requested' }) => void;
}

interface StreamState {
  events: SessionEvent[];
  status: RunStatus | 'idle';
  error?: string;
}

function statusFromEvent(event: SessionEvent): RunStatus | undefined {
  if (event.type === 'run.started') {
    return 'running';
  }
  if (event.type === 'approval.requested') {
    return 'suspended';
  }
  if (event.type === 'run.completed') {
    return 'completed';
  }
  if (event.type === 'run.failed') {
    return 'failed';
  }
  if (event.type === 'run.cancelled') {
    return 'cancelled';
  }
  return undefined;
}

export function useEventStream(runId: string | null, options?: UseEventStreamOptions) {
  const [state, setState] = useState<StreamState>({
    events: [],
    status: 'idle',
  });

  const closeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!runId) {
      setState({ events: [], status: 'idle' });
      return;
    }

    setState({ events: [], status: 'pending' });
    let disposed = false;
    const rid = runId;

    const close = connectSSE(
      runId,
      (event) => {
        if (event.type === 'approval.requested') {
          optionsRef.current?.onApprovalRequested?.(event);
        }
        const nextStatus = statusFromEvent(event);
        setState((prev) => ({
          ...prev,
          events: [...prev.events, event],
          ...(nextStatus ? { status: nextStatus } : {}),
        }));
      },
      () => {
        if (disposed) {
          return;
        }
        void api
          .getRun(rid)
          .then((run) => {
            if (!disposed) {
              setState((prev) => ({ ...prev, status: run.status }));
            }
          })
          .catch(() => {
            if (!disposed) {
              setState((prev) => ({
                ...prev,
                status:
                  prev.status === 'pending' || prev.status === 'running'
                    ? 'completed'
                    : prev.status,
              }));
            }
          });
      },
      (err) => {
        if (disposed) {
          return;
        }
        void api
          .getRun(rid)
          .then((run) => {
            if (!disposed) {
              setState((prev) => ({
                ...prev,
                error: err.message,
                status: run.status,
              }));
            }
          })
          .catch(() => {
            if (!disposed) {
              setState((prev) => ({ ...prev, error: err.message }));
            }
          });
      },
    );

    closeRef.current = close;
    return () => {
      disposed = true;
      close();
    };
  }, [runId]);

  const disconnect = useCallback(() => {
    closeRef.current?.();
  }, []);

  return {
    events: state.events,
    status: state.status,
    error: state.error,
    disconnect,
  };
}
