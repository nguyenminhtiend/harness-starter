import type { SessionStatus, UIEvent } from '../../../shared/events.ts';
import type { ProviderKeys } from '../../config.ts';

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

export interface SessionContext {
  sessionId: string;
  toolId: string;
  question: string;
  settings: Record<string, unknown>;
  resumeSessionId?: string;
  signal: AbortSignal;
  abortController: AbortController;
  providerKeys: ProviderKeys;
}

export interface SessionHandle {
  sessionId: string;
  events: AsyncIterable<UIEvent>;
}
