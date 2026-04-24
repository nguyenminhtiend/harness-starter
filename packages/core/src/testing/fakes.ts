import type { PendingApproval } from '../domain/approval.ts';
import type { Logger } from '../domain/capability.ts';
import type { Conversation } from '../domain/conversation.ts';
import type { RunSnapshot } from '../domain/run.ts';
import type { SessionEvent } from '../domain/session-event.ts';
import type { ApprovalStore } from '../ports/approval-store.ts';
import type { Clock } from '../ports/clock.ts';
import type { ConversationStore } from '../ports/conversation-store.ts';
import type { EventBus } from '../ports/event-bus.ts';
import type { EventLog } from '../ports/event-log.ts';
import type { IdGen } from '../ports/id-gen.ts';
import type { MemoryProvider } from '../ports/memory-provider.ts';
import type { RunFilter, RunStore } from '../ports/run-store.ts';
import type { SettingsStore } from '../ports/settings-store.ts';

export function createFakeRunStore(): RunStore {
  const runs = new Map<string, RunSnapshot>();

  return {
    async create(id, capabilityId, createdAt, conversationId) {
      runs.set(id, {
        id,
        capabilityId,
        status: 'pending',
        createdAt,
        conversationId,
      });
    },
    async get(id) {
      return runs.get(id);
    },
    async list(filter?: RunFilter) {
      let result = [...runs.values()];
      if (filter?.status) {
        result = result.filter((r) => r.status === filter.status);
      }
      if (filter?.capabilityId) {
        result = result.filter((r) => r.capabilityId === filter.capabilityId);
      }
      if (filter?.conversationId) {
        result = result.filter((r) => r.conversationId === filter.conversationId);
      }
      if (filter?.limit) {
        result = result.slice(0, filter.limit);
      }
      return result;
    },
    async updateStatus(id, status, finishedAt) {
      const run = runs.get(id);
      if (run) {
        runs.set(id, { ...run, status, finishedAt });
      }
    },
    async delete(id) {
      runs.delete(id);
    },
  };
}

export function createFakeEventLog(): EventLog {
  const events = new Map<string, SessionEvent[]>();

  return {
    async append(event) {
      const list = events.get(event.runId) ?? [];
      list.push(event);
      events.set(event.runId, list);
    },
    async read(runId, fromSeq, toSeq) {
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

export function createFakeEventBus(): EventBus {
  const subscribers = new Map<string, Array<(event: SessionEvent) => void>>();
  const closed = new Set<string>();

  return {
    publish(event) {
      const subs = subscribers.get(event.runId);
      if (subs) {
        for (const cb of subs) {
          cb(event);
        }
      }
    },
    subscribe(runId, _fromSeq) {
      const buffer: SessionEvent[] = [];
      let resolve: ((value: IteratorResult<SessionEvent>) => void) | null = null;
      let done = false;

      const cb = (event: SessionEvent) => {
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ value: event, done: false });
        } else {
          buffer.push(event);
        }
      };

      const subs = subscribers.get(runId) ?? [];
      subs.push(cb);
      subscribers.set(runId, subs);

      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<SessionEvent>> {
              if (done) {
                return Promise.resolve({ value: undefined, done: true });
              }
              const buffered = buffer.shift();
              if (buffered) {
                return Promise.resolve({ value: buffered, done: false });
              }
              if (closed.has(runId)) {
                done = true;
                return Promise.resolve({ value: undefined, done: true });
              }
              return new Promise<IteratorResult<SessionEvent>>((r) => {
                resolve = r;
              });
            },
            return() {
              done = true;
              return Promise.resolve({ value: undefined, done: true });
            },
          };
        },
      };
    },
    close(runId) {
      closed.add(runId);
      const subs = subscribers.get(runId);
      if (subs) {
        subscribers.delete(runId);
      }
    },
  };
}

export function createFakeApprovalStore(): ApprovalStore {
  const approvals = new Map<string, PendingApproval>();

  return {
    async createPending(approval) {
      approvals.set(approval.id, approval);
    },
    async resolve(id, decision, resolvedAt) {
      const existing = approvals.get(id);
      if (existing) {
        approvals.set(id, { ...existing, status: 'resolved', decision, resolvedAt });
      }
    },
    async get(id) {
      return approvals.get(id);
    },
    async listPending(runId) {
      return [...approvals.values()].filter((a) => a.runId === runId && a.status === 'pending');
    },
  };
}

export function createFakeConversationStore(): ConversationStore {
  const conversations = new Map<string, Conversation>();

  return {
    async create(conversation) {
      conversations.set(conversation.id, conversation);
    },
    async get(id) {
      return conversations.get(id);
    },
    async list(capabilityId) {
      let result = [...conversations.values()];
      if (capabilityId) {
        result = result.filter((c) => c.capabilityId === capabilityId);
      }
      return result;
    },
    async updateLastActivity(id, lastActivityAt) {
      const existing = conversations.get(id);
      if (existing) {
        conversations.set(id, { ...existing, lastActivityAt });
      }
    },
    async delete(id) {
      conversations.delete(id);
    },
  };
}

export function createFakeSettingsStore(): SettingsStore {
  const store = new Map<string, unknown>();
  const key = (scope: string, k: string) => `${scope}:${k}`;

  return {
    async get(scope, k) {
      return store.get(key(scope, k));
    },
    async set(scope, k, value) {
      store.set(key(scope, k), value);
    },
    async getAll(scope) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of store) {
        if (k.startsWith(`${scope}:`)) {
          result[k.slice(scope.length + 1)] = v;
        }
      }
      return result;
    },
    async delete(scope, k) {
      store.delete(key(scope, k));
    },
  };
}

export function createFakeClock(fixed?: string): Clock {
  const ts = fixed ?? '2026-04-24T00:00:00.000Z';
  return {
    now() {
      return ts;
    },
  };
}

export function createFakeIdGen(prefix = 'fake'): IdGen {
  let counter = 0;
  return {
    next() {
      counter++;
      return `${prefix}-${String(counter).padStart(4, '0')}`;
    },
  };
}

export function createFakeLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() {
      return createFakeLogger();
    },
  };
}

export function createFakeMemoryProvider(): MemoryProvider {
  return {
    forConversation(_conversationId) {
      return null;
    },
  };
}
