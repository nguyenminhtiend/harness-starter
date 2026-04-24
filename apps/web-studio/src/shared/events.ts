export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SessionMeta {
  id: string;
  toolId: string;
  question: string;
  status: SessionStatus;
  conversationId?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface StreamChunk {
  type: string;
  ts: number;
  [key: string]: unknown;
}
