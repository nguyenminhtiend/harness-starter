import type { SessionEvent } from '../../domain/session-event.ts';

export interface EventLog {
  append(event: SessionEvent): Promise<void>;
  read(runId: string, fromSeq?: number, toSeq?: number): Promise<SessionEvent[]>;
  lastSeq(runId: string): Promise<number | undefined>;
  deleteByRunId(runId: string): Promise<void>;
}

export function createInMemoryEventLog(): EventLog {
  const events = new Map<string, SessionEvent[]>();

  return {
    async append(event) {
      const list = events.get(event.runId) ?? [];
      list.push(event);
      events.set(event.runId, list);
    },

    async read(runId, fromSeq?, toSeq?) {
      const list = events.get(runId) ?? [];
      return list.filter((e) => {
        if (fromSeq !== undefined && e.seq < fromSeq) {
          return false;
        }
        if (toSeq !== undefined && e.seq > toSeq) {
          return false;
        }
        return true;
      });
    },

    async lastSeq(runId) {
      const list = events.get(runId);
      if (!list || list.length === 0) {
        return undefined;
      }
      return list[list.length - 1]?.seq;
    },

    async deleteByRunId(runId) {
      events.delete(runId);
    },
  };
}
