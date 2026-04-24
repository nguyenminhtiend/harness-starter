import type { MemoryHandle } from '../domain/capability.ts';

export interface MemoryProvider {
  forConversation(conversationId: string): MemoryHandle | null;
}
