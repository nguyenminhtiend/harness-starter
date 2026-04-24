import type { MemoryHandle, MemoryProvider } from '@harness/core';

export interface ConversationMemoryConfig {
  readonly enabled: boolean;
}

export function createConversationMemoryProvider(config: ConversationMemoryConfig): MemoryProvider {
  return {
    forConversation(conversationId: string): MemoryHandle | null {
      if (!config.enabled) {
        return null;
      }
      return { conversationId };
    },
  };
}
