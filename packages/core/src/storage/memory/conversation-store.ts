import type { Conversation } from '../../domain/conversation.ts';

export interface ConversationStore {
  create(conversation: Conversation): Promise<void>;
  get(id: string): Promise<Conversation | undefined>;
  list(capabilityId?: string): Promise<Conversation[]>;
  updateLastActivity(id: string, lastActivityAt: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createInMemoryConversationStore(): ConversationStore {
  const conversations = new Map<string, Conversation>();

  return {
    async create(conversation) {
      conversations.set(conversation.id, conversation);
    },

    async get(id) {
      return conversations.get(id);
    },

    async list(capabilityId?) {
      let result = [...conversations.values()];
      if (capabilityId) {
        result = result.filter((c) => c.capabilityId === capabilityId);
      }
      return result;
    },

    async updateLastActivity(id, lastActivityAt) {
      const existing = conversations.get(id);
      if (existing) {
        conversations.set(id, { ...existing, lastActivityAt });
      }
    },

    async delete(id) {
      conversations.delete(id);
    },
  };
}
