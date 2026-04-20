import type { RunStatus, UIEvent } from '../../../shared/events.ts';

export interface RunRow {
  id: string;
  toolId: string;
  question: string;
  status: RunStatus;
  costUsd?: number;
  totalTokens?: number;
  createdAt: string;
  finishedAt?: string;
}

export interface CreateRunInput {
  id: string;
  toolId: string;
  question: string;
  status: RunStatus;
}

export interface UpdateRunInput {
  status?: RunStatus;
  costUsd?: number;
  totalTokens?: number;
  finishedAt?: string;
}

export interface ListRunsFilter {
  status?: RunStatus;
  q?: string;
  limit?: number;
}

export interface StoredEvent {
  seq: number;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface RunContext {
  runId: string;
  toolId: string;
  question: string;
  settings: Record<string, unknown>;
  resumeRunId?: string;
  signal: AbortSignal;
  abortController: AbortController;
  apiKey: string;
}

export interface RunHandle {
  runId: string;
  events: AsyncIterable<UIEvent>;
}
