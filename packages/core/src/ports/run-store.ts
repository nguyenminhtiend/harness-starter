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
