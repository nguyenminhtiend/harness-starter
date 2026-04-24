import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionStatus, StreamChunk } from '../../shared/events.ts';
import { api, connectSSE } from '../api.ts';

interface StreamState {
  chunks: StreamChunk[];
  status: SessionStatus | 'idle';
  error?: string;
}

export interface UseEventStreamOptions {
  onHitlRequired?: (chunk: StreamChunk) => void;
}

export function useEventStream(sessionId: string | null, options?: UseEventStreamOptions) {
  const [state, setState] = useState<StreamState>({
    chunks: [],
    status: 'idle',
  });

  const closeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!sessionId) {
      setState({ chunks: [], status: 'idle' });
      return;
    }

    setState({ chunks: [], status: 'running' });
    let disposed = false;
    const sid = sessionId;

    const close = connectSSE(
      sessionId,
      (chunk) => {
        if (chunk.type === 'hitl-required') {
          optionsRef.current?.onHitlRequired?.(chunk);
        }
        setState((prev) => ({
          ...prev,
          chunks: [...prev.chunks, chunk],
          ...(chunk.type === 'status' ? { status: chunk.status as SessionStatus } : {}),
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
    chunks: state.chunks,
    status: state.status,
    error: state.error,
    disconnect,
  };
}
