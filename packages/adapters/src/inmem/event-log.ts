import type { EventLog, SessionEvent } from '@harness/core';

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
  };
}
