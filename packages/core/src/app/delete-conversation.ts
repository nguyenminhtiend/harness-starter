import { NotFoundError } from '../domain/errors.ts';
import type { ConversationStore } from '../ports/conversation-store.ts';
import type { EventLog } from '../ports/event-log.ts';
import type { RunStore } from '../ports/run-store.ts';

export interface DeleteConversationDeps {
  readonly conversationStore: ConversationStore;
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
}

export async function deleteConversation(
  deps: DeleteConversationDeps,
  conversationId: string,
): Promise<void> {
  const conversation = await deps.conversationStore.get(conversationId);
  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  const runs = await deps.runStore.list({ conversationId });
  for (const run of runs) {
    await deps.eventLog.deleteByRunId(run.id);
    await deps.runStore.delete(run.id);
  }

  await deps.conversationStore.delete(conversationId);
}
