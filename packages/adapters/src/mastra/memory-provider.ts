import type { MemoryHandle, MemoryProvider } from '@harness/core';

export interface MastraMemoryProviderConfig {
  readonly enabled: boolean;
}

export function createMastraMemoryProvider(config: MastraMemoryProviderConfig): MemoryProvider {
  return {
    forConversation(conversationId: string): MemoryHandle | null {
      if (!config.enabled) {
        return null;
      }
      return { conversationId };
    },
  };
}
