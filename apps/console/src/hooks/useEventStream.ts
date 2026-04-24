import type { RunStatus, SessionEvent } from '@harness/http/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, connectSSE } from '../api/client.ts';

export type { RunStatus };

export interface UseEventStreamOptions {
  onApprovalRequested?: (event: SessionEvent & { type: 'approval.requested' }) => void;
}

interface StreamState {
  status: RunStatus | 'idle';
  version: number;
  error?: string;
}

function statusFromEvent(event: SessionEvent): RunStatus | undefined {
  if (event.type === 'run.started') {
    return 'running';
  }
  if (event.type === 'approval.requested') {
    return 'suspended';
  }
  if (event.type === 'approval.resolved') {
    return 'running';
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

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

export function useEventStream(runId: string | null, options?: UseEventStreamOptions) {
  const [state, setState] = useState<StreamState>({
    status: 'idle',
    version: 0,
  });

  const eventsRef = useRef<SessionEvent[]>([]);
  const closeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!runId) {
      eventsRef.current = [];
      setState({ status: 'idle', version: 0 });
      return;
    }

    eventsRef.current = [];
    setState({ status: 'pending', version: 0 });
    let disposed = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const rid = runId;

    function getLastSeq(): number | undefined {
      const events = eventsRef.current;
      if (events.length === 0) {
        return undefined;
      }
      return events[events.length - 1]?.seq;
    }

    function startStream(lastEventId?: number): void {
      if (disposed) {
        return;
      }

      closeRef.current?.();

      const close = connectSSE(
        rid,
        (event) => {
          reconnectAttempts = 0;
          if (event.type === 'approval.requested') {
            optionsRef.current?.onApprovalRequested?.(event);
          }
          eventsRef.current.push(event);
          const nextStatus = statusFromEvent(event);
          setState((prev) => ({
            ...prev,
            version: prev.version + 1,
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
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts;
            reconnectAttempts++;
            reconnectTimer = setTimeout(() => startStream(getLastSeq()), delay);
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
        lastEventId,
      );

      closeRef.current = close;
    }

    startStream();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      closeRef.current?.();
    };
  }, [runId]);

  const disconnect = useCallback(() => {
    closeRef.current?.();
  }, []);

  return {
    events: eventsRef.current,
    status: state.status,
    error: state.error,
    disconnect,
    version: state.version,
  };
}
