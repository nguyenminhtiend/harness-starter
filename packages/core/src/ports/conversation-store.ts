import type { Conversation } from '../domain/conversation.ts';

export interface ConversationStore {
  create(conversation: Conversation): Promise<void>;
  get(id: string): Promise<Conversation | undefined>;
  list(capabilityId?: string): Promise<Conversation[]>;
  updateLastActivity(id: string, lastActivityAt: string): Promise<void>;
  delete(id: string): Promise<void>;
}
