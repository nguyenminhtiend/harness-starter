import type { RunSnapshot, RunStatus } from '../domain/run.ts';

export interface RunFilter {
  readonly status?: RunStatus | undefined;
  readonly capabilityId?: string | undefined;
  readonly conversationId?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface RunStore {
  create(
    id: string,
    capabilityId: string,
    createdAt: string,
    conversationId?: string,
  ): Promise<void>;
  get(id: string): Promise<RunSnapshot | undefined>;
  list(filter?: RunFilter): Promise<RunSnapshot[]>;
  updateStatus(id: string, status: RunStatus, finishedAt?: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createInMemoryRunStore(): RunStore {
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
      result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (filter?.offset != null) {
        result = result.slice(filter.offset);
      }
      if (filter?.limit != null) {
        result = result.slice(0, filter.limit);
      }
      return result;
    },

    async updateStatus(id: string, status: RunStatus, finishedAt?: string) {
      const run = runs.get(id);
      if (run) {
        runs.set(id, { ...run, status, finishedAt: finishedAt ?? run.finishedAt });
      }
    },

    async delete(id) {
      runs.delete(id);
    },
  };
}
