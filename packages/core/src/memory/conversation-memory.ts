import type { MemoryHandle } from '../domain/capability.ts';

export interface ConversationMemoryConfig {
  readonly enabled: boolean;
}

export interface MemoryProvider {
  forConversation(conversationId: string): MemoryHandle | null;
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
