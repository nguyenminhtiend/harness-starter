import { describe, expect, it } from 'bun:test';
import type { Conversation, ConversationStore } from '@harness/core';
import { createInMemoryConversationStore } from './conversation-store.ts';

function makeStore(): ConversationStore {
  return createInMemoryConversationStore();
}

const TS = '2026-04-24T00:00:00.000Z';

function makeConversation(id: string, capabilityId = 'simple-chat'): Conversation {
  return { id, capabilityId, createdAt: TS, lastActivityAt: TS };
}

describe('InMemoryConversationStore', () => {
  it('creates and retrieves a conversation', async () => {
    const store = makeStore();
    const conv = makeConversation('c-1');
    await store.create(conv);

    expect(await store.get('c-1')).toEqual(conv);
  });

  it('returns undefined for non-existent conversation', async () => {
    const store = makeStore();
    expect(await store.get('nope')).toBeUndefined();
  });

  it('lists all conversations', async () => {
    const store = makeStore();
    await store.create(makeConversation('c-1'));
    await store.create(makeConversation('c-2', 'deep-research'));

    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it('lists conversations filtered by capabilityId', async () => {
    const store = makeStore();
    await store.create(makeConversation('c-1', 'simple-chat'));
    await store.create(makeConversation('c-2', 'deep-research'));

    const filtered = await store.list('deep-research');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('c-2');
  });

  it('updates lastActivityAt', async () => {
    const store = makeStore();
    await store.create(makeConversation('c-1'));

    const newTs = '2026-04-24T12:00:00.000Z';
    await store.updateLastActivity('c-1', newTs);

    const conv = await store.get('c-1');
    expect(conv?.lastActivityAt).toBe(newTs);
  });

  it('updateLastActivity is a no-op for non-existent conversation', async () => {
    const store = makeStore();
    await store.updateLastActivity('nope', TS);
  });

  it('deletes a conversation', async () => {
    const store = makeStore();
    await store.create(makeConversation('c-1'));
    await store.delete('c-1');

    expect(await store.get('c-1')).toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });

  it('delete is a no-op for non-existent conversation', async () => {
    const store = makeStore();
    await store.delete('nope');
  });
});
