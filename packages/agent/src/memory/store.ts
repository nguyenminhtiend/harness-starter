import type { Message } from '@harness/core';
import type { ConversationStore } from '../types.ts';

export function inMemoryStore(): ConversationStore {
  const data = new Map<string, Message[]>();

  return {
    async load(conversationId: string): Promise<Message[]> {
      return [...(data.get(conversationId) ?? [])];
    },
    async append(conversationId: string, messages: Message[]): Promise<void> {
      const existing = data.get(conversationId) ?? [];
      data.set(conversationId, [...existing, ...messages]);
    },
  };
}
