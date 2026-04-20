import { useCallback, useEffect, useRef, useState } from 'react';
import type { HitlRequiredEvent, RunStatus, UIEvent } from '../../shared/events.ts';
import { connectSSE } from '../api.ts';

export interface EventStreamState {
  events: UIEvent[];
  status: RunStatus | 'idle';
  tokens: number;
  cost: number;
  error?: string;
}

export interface UseEventStreamOptions {
  onHitlRequired?: (ev: HitlRequiredEvent) => void;
}

export function useEventStream(runId: string | null, options?: UseEventStreamOptions) {
  const [state, setState] = useState<EventStreamState>({
    events: [],
    status: 'idle',
    tokens: 0,
    cost: 0,
  });

  const closeRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!runId) {
      return;
    }

    setState({ events: [], status: 'running', tokens: 0, cost: 0 });

    const close = connectSSE(
      runId,
      (ev) => {
        if (ev.type === 'hitl-required') {
          optionsRef.current?.onHitlRequired?.(ev);
        }
        setState((prev) => {
          const events = [...prev.events, ev];
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

          return { events, status, tokens, cost };
        });
      },
      () => {
        setState((prev) => ({
          ...prev,
          status: prev.status === 'running' ? 'completed' : prev.status,
        }));
      },
      (err) => {
        setState((prev) => ({ ...prev, error: err.message }));
      },
    );

    closeRef.current = close;
    return () => close();
  }, [runId]);

  const disconnect = useCallback(() => {
    closeRef.current?.();
  }, []);

  return { ...state, disconnect };
}
