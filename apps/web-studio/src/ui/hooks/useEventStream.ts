import { useCallback, useEffect, useRef, useState } from 'react';
import type { HitlRequiredEvent, SessionStatus, UIEvent } from '../../shared/events.ts';
import { api, connectSSE } from '../api.ts';

interface StreamState {
  events: UIEvent[];
  status: SessionStatus | 'idle';
  error?: string;
}

export interface UseEventStreamOptions {
  onHitlRequired?: (ev: HitlRequiredEvent) => void;
}

export function useEventStream(sessionId: string | null, options?: UseEventStreamOptions) {
  const [state, setState] = useState<StreamState>({
    events: [],
    status: 'idle',
  });

  const closeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!sessionId) {
      setState({ events: [], status: 'idle' });
      return;
    }

    setState({ events: [], status: 'running' });
    let disposed = false;
    const sid = sessionId;

    const close = connectSSE(
      sessionId,
      (ev) => {
        if (ev.type === 'hitl-required') {
          optionsRef.current?.onHitlRequired?.(ev);
        }
        setState((prev) => ({
          ...prev,
          events: [...prev.events, ev],
          ...(ev.type === 'status' ? { status: ev.status } : {}),
        }));
      },
      () => {
        if (disposed) {
          return;
        }
        void api
          .getSession(sid)
          .then((session) => {
            if (!disposed) {
              setState((prev) => ({ ...prev, status: session.status }));
            }
          })
          .catch(() => {
            if (!disposed) {
              setState((prev) => ({
                ...prev,
                status: prev.status === 'running' ? 'completed' : prev.status,
              }));
            }
          });
      },
      (err) => {
        if (disposed) {
          return;
        }
        void api
          .getSession(sid)
          .then((session) => {
            if (!disposed) {
              setState((prev) => ({
                ...prev,
                error: err.message,
                status: session.status,
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
  }, [sessionId]);

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
