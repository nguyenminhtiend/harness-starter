import { useCallback, useEffect, useRef, useState } from 'react';
import type { HitlRequiredEvent, RunStatus, UIEvent } from '../../shared/events.ts';
import { connectSSE } from '../api.ts';

interface StreamMeta {
  status: RunStatus | 'idle';
  tokens: number;
  cost: number;
  error?: string;
  /** Incremented on each push to trigger re-render without copying the array. */
  tick: number;
}

export interface UseEventStreamOptions {
  onHitlRequired?: (ev: HitlRequiredEvent) => void;
}

export function useEventStream(runId: string | null, options?: UseEventStreamOptions) {
  const eventsRef = useRef<UIEvent[]>([]);
  const [meta, setMeta] = useState<StreamMeta>({
    status: 'idle',
    tokens: 0,
    cost: 0,
    tick: 0,
  });

  const closeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!runId) {
      return;
    }

    eventsRef.current = [];
    setMeta({ status: 'running', tokens: 0, cost: 0, tick: 0 });

    const close = connectSSE(
      runId,
      (ev) => {
        if (ev.type === 'hitl-required') {
          optionsRef.current?.onHitlRequired?.(ev);
        }
        eventsRef.current.push(ev);
        setMeta((prev) => {
          let { tokens, cost, status } = prev;

          if (ev.type === 'metric') {
            tokens = ev.inputTokens + ev.outputTokens;
            cost = ev.costUsd ?? cost;
          }
          if (ev.type === 'status') {
            status = ev.status;
          }
          if (ev.type === 'complete') {
            tokens = ev.totalTokens;
            cost = ev.totalCostUsd ?? cost;
          }

          return { status, tokens, cost, tick: prev.tick + 1 };
        });
      },
      () => {
        setMeta((prev) => ({
          ...prev,
          status: prev.status === 'running' ? 'completed' : prev.status,
        }));
      },
      (err) => {
        setMeta((prev) => ({ ...prev, error: err.message }));
      },
    );

    closeRef.current = close;
    return () => close();
  }, [runId]);

  const disconnect = useCallback(() => {
    closeRef.current?.();
  }, []);

  const events = eventsRef.current;

  return {
    events,
    status: meta.status,
    tokens: meta.tokens,
    cost: meta.cost,
    error: meta.error,
    disconnect,
  };
}
