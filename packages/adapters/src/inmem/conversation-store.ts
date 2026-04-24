import type { Conversation, ConversationStore } from '@harness/core';

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
