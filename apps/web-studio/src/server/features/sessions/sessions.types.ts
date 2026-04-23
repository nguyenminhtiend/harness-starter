import type { ProviderKeys } from '@harness/llm-adapter';
import type { UIEvent } from '@harness/session-events';

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
  events: AsyncIterable<UIEvent>;
}
