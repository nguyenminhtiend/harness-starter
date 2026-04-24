import { describe, expect, it } from 'bun:test';
import { NotFoundError } from '../domain/errors.ts';
import {
  createFakeConversationStore,
  createFakeEventLog,
  createFakeRunStore,
} from '../testing/fakes.ts';
import { deleteConversation } from './delete-conversation.ts';
import { getConversationMessages } from './get-conversation-messages.ts';
import { listConversations } from './list-conversations.ts';

describe('listConversations', () => {
  it('returns conversations filtered by capabilityId', async () => {
    const store = createFakeConversationStore();
    await store.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    await store.create({
      id: 'c2',
      capabilityId: 'research',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });

    const result = await listConversations({ conversationStore: store }, 'chat');
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe('c1');
  });
});

describe('getConversationMessages', () => {
  it('rebuilds user + assistant messages from run events', async () => {
    const conversationStore = createFakeConversationStore();
    const runStore = createFakeRunStore();
    const eventLog = createFakeEventLog();

    await conversationStore.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    await runStore.create('r1', 'chat', '2026-01-01T00:00:00Z', 'c1');

    await eventLog.append({
      runId: 'r1',
      seq: 0,
      ts: '2026-01-01T00:00:00Z',
      type: 'run.started',
      capabilityId: 'chat',
      input: { message: 'Hello' },
    });
    await eventLog.append({
      runId: 'r1',
      seq: 1,
      ts: '2026-01-01T00:00:01Z',
      type: 'text.delta',
      text: 'Hi ',
    });
    await eventLog.append({
      runId: 'r1',
      seq: 2,
      ts: '2026-01-01T00:00:02Z',
      type: 'text.delta',
      text: 'there!',
    });
    await eventLog.append({
      runId: 'r1',
      seq: 3,
      ts: '2026-01-01T00:00:03Z',
      type: 'run.completed',
      output: null,
    });

    const msgs = await getConversationMessages({ conversationStore, runStore, eventLog }, 'c1');

    expect(msgs).toEqual([
      { role: 'user', content: 'Hello', runId: 'r1', ts: '2026-01-01T00:00:00Z' },
      { role: 'assistant', content: 'Hi there!', runId: 'r1', ts: '2026-01-01T00:00:02Z' },
    ]);
  });

  it('orders messages across multiple runs', async () => {
    const conversationStore = createFakeConversationStore();
    const runStore = createFakeRunStore();
    const eventLog = createFakeEventLog();

    await conversationStore.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:10Z',
    });
    await runStore.create('r1', 'chat', '2026-01-01T00:00:00Z', 'c1');
    await runStore.create('r2', 'chat', '2026-01-01T00:00:05Z', 'c1');

    await eventLog.append({
      runId: 'r1',
      seq: 0,
      ts: '2026-01-01T00:00:00Z',
      type: 'run.started',
      capabilityId: 'chat',
      input: { message: 'First' },
    });
    await eventLog.append({
      runId: 'r1',
      seq: 1,
      ts: '2026-01-01T00:00:01Z',
      type: 'text.delta',
      text: 'Response 1',
    });
    await eventLog.append({
      runId: 'r1',
      seq: 2,
      ts: '2026-01-01T00:00:02Z',
      type: 'run.completed',
      output: null,
    });

    await eventLog.append({
      runId: 'r2',
      seq: 0,
      ts: '2026-01-01T00:00:05Z',
      type: 'run.started',
      capabilityId: 'chat',
      input: { message: 'Second' },
    });
    await eventLog.append({
      runId: 'r2',
      seq: 1,
      ts: '2026-01-01T00:00:06Z',
      type: 'text.delta',
      text: 'Response 2',
    });
    await eventLog.append({
      runId: 'r2',
      seq: 2,
      ts: '2026-01-01T00:00:07Z',
      type: 'run.completed',
      output: null,
    });

    const msgs = await getConversationMessages({ conversationStore, runStore, eventLog }, 'c1');

    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(msgs.map((m) => m.content)).toEqual(['First', 'Response 1', 'Second', 'Response 2']);
  });

  it('throws NotFoundError for unknown conversation', async () => {
    const deps = {
      conversationStore: createFakeConversationStore(),
      runStore: createFakeRunStore(),
      eventLog: createFakeEventLog(),
    };
    await expect(getConversationMessages(deps, 'nope')).rejects.toThrow(NotFoundError);
  });
});

describe('deleteConversation', () => {
  it('cascade deletes runs, events, and the conversation', async () => {
    const conversationStore = createFakeConversationStore();
    const runStore = createFakeRunStore();
    const eventLog = createFakeEventLog();

    await conversationStore.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    await runStore.create('r1', 'chat', '2026-01-01T00:00:00Z', 'c1');
    await eventLog.append({
      runId: 'r1',
      seq: 0,
      ts: '2026-01-01T00:00:00Z',
      type: 'run.started',
      capabilityId: 'chat',
      input: {},
    });

    await deleteConversation({ conversationStore, runStore, eventLog }, 'c1');

    expect(await conversationStore.get('c1')).toBeUndefined();
    expect(await runStore.get('r1')).toBeUndefined();
    expect(await eventLog.read('r1')).toEqual([]);
  });

  it('throws NotFoundError for unknown conversation', async () => {
    const deps = {
      conversationStore: createFakeConversationStore(),
      runStore: createFakeRunStore(),
      eventLog: createFakeEventLog(),
    };
    await expect(deleteConversation(deps, 'nope')).rejects.toThrow(NotFoundError);
  });
});
