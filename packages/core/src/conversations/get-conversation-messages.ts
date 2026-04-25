import { NotFoundError } from '../domain/errors.ts';
import type { SessionEvent } from '../domain/session-event.ts';
import type { ConversationStore } from '../storage/conversation-store.ts';
import type { EventLog } from '../storage/event-log.ts';
import type { RunStore } from '../storage/run-store.ts';

export interface GetConversationMessagesDeps {
  readonly conversationStore: ConversationStore;
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
}

export interface ConversationMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly runId: string;
  readonly ts: string;
}

export async function getConversationMessages(
  deps: GetConversationMessagesDeps,
  conversationId: string,
): Promise<ConversationMessage[]> {
  const conversation = await deps.conversationStore.get(conversationId);
  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  const runs = await deps.runStore.list({ conversationId });
  const sorted = [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const messages: ConversationMessage[] = [];

  for (const run of sorted) {
    const events = await deps.eventLog.read(run.id);
    const pair = extractMessages(run.id, events);
    messages.push(...pair);
  }

  return messages;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable input]';
  }
}

function extractMessages(runId: string, events: SessionEvent[]): ConversationMessage[] {
  const result: ConversationMessage[] = [];
  let userContent: string | undefined;
  let userTs: string | undefined;
  const textParts: string[] = [];
  let lastTextTs: string | undefined;

  for (const event of events) {
    if (event.type === 'run.started') {
      const input = event.input as { message?: string } | null;
      userContent = typeof input?.message === 'string' ? input.message : safeStringify(input);
      userTs = event.ts;
    } else if (event.type === 'text.delta') {
      textParts.push(event.text);
      lastTextTs = event.ts;
    }
  }

  if (userContent !== undefined && userTs !== undefined) {
    result.push({ role: 'user', content: userContent, runId, ts: userTs });
  }
  if (textParts.length > 0 && lastTextTs !== undefined) {
    result.push({ role: 'assistant', content: textParts.join(''), runId, ts: lastTextTs });
  }

  return result;
}
