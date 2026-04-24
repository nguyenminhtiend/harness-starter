import type { SessionEvent } from '../domain/session-event.ts';

export interface EventLog {
  append(event: SessionEvent): Promise<void>;
  read(runId: string, fromSeq?: number, toSeq?: number): Promise<SessionEvent[]>;
  lastSeq(runId: string): Promise<number | undefined>;
  deleteByRunId(runId: string): Promise<void>;
}
