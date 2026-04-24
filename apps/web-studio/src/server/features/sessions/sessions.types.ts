import type { StreamChunk } from '../../../shared/events.ts';
import type { ProviderKeys } from '../../infra/llm.ts';

export interface SessionContext {
  sessionId: string;
  toolId: string;
  question: string;
  settings: Record<string, unknown>;
  resumeSessionId?: string;
  conversationId?: string;
  signal: AbortSignal;
  abortController: AbortController;
  providerKeys: ProviderKeys;
}

export interface SessionHandle {
  sessionId: string;
  events: AsyncIterable<StreamChunk>;
}
