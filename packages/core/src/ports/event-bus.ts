import type { SessionEvent } from '../domain/session-event.ts';

export interface EventBus {
  publish(event: SessionEvent): void;
  subscribe(runId: string, fromSeq?: number): AsyncIterable<SessionEvent>;
  close(runId: string): void;
}
