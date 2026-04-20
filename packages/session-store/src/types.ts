export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SessionRow {
  id: string;
  toolId: string;
  question: string;
  status: SessionStatus;
  createdAt: string;
  finishedAt?: string;
}

export interface CreateSessionInput {
  id: string;
  toolId: string;
  question: string;
  status: SessionStatus;
}

export interface UpdateSessionInput {
  status?: SessionStatus;
  finishedAt?: string;
}

export interface ListSessionsFilter {
  status?: SessionStatus;
  q?: string;
  limit?: number;
}

export interface StoredEvent {
  seq: number;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface EventInput {
  type: string;
  ts: number;
}
