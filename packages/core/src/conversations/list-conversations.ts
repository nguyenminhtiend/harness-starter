import type { Conversation } from '../domain/conversation.ts';
import type { ConversationStore } from '../storage/inmem-conversation-store.ts';

export interface ListConversationsDeps {
  readonly conversationStore: ConversationStore;
}

export async function listConversations(
  deps: ListConversationsDeps,
  capabilityId?: string,
): Promise<Conversation[]> {
  return deps.conversationStore.list(capabilityId);
}
