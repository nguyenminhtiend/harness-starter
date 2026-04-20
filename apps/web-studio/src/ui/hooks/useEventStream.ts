import { useCallback, useEffect, useRef, useState } from 'react';
import type { HitlRequiredEvent, SessionStatus, UIEvent } from '../../shared/events.ts';
import { api, connectSSE } from '../api.ts';

interface StreamMeta {
  status: SessionStatus | 'idle';
  error?: string;
  tick: number;
}

export interface UseEventStreamOptions {
  onHitlRequired?: (ev: HitlRequiredEvent) => void;
}

export function useEventStream(sessionId: string | null, options?: UseEventStreamOptions) {
  const eventsRef = useRef<UIEvent[]>([]);
  const [meta, setMeta] = useState<StreamMeta>({
    status: 'idle',
    tick: 0,
  });

  const closeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!sessionId) {
      eventsRef.current = [];
      setMeta({ status: 'idle', tick: 0 });
      return;
    }

    eventsRef.current = [];
    setMeta({ status: 'running', tick: 0 });
    let disposed = false;
    const sid = sessionId;

    const close = connectSSE(
      sessionId,
      (ev) => {
        if (ev.type === 'hitl-required') {
          optionsRef.current?.onHitlRequired?.(ev);
        }
        eventsRef.current.push(ev);
        setMeta((prev) => {
          let { status } = prev;
          if (ev.type === 'status') {
            status = ev.status;
          }
          return { ...prev, status, tick: prev.tick + 1 };
        });
      },
      () => {
        if (disposed) {
          return;
        }
        void api
          .getSession(sid)
          .then((session) => {
            if (!disposed) {
              setMeta((prev) => ({ ...prev, status: session.status }));
            }
          })
          .catch(() => {
            if (!disposed) {
              setMeta((prev) => ({
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
              setMeta((prev) => ({
                ...prev,
                error: err.message,
                status: session.status,
              }));
            }
          })
          .catch(() => {
            if (!disposed) {
              setMeta((prev) => ({ ...prev, error: err.message }));
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

  const events = eventsRef.current;

  return {
    events,
    status: meta.status,
    error: meta.error,
    disconnect,
  };
}
