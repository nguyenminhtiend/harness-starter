import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import type { Capability, ExecutionContext } from '../domain/capability.ts';
import { ConflictError, NotFoundError } from '../domain/errors.ts';
import type { StreamEventPayload } from '../domain/session-event.ts';
import {
  createFakeApprovalStore,
  createFakeClock,
  createFakeConversationStore,
  createFakeEventBus,
  createFakeEventLog,
  createFakeIdGen,
  createFakeLogger,
  createFakeRunStore,
  createFakeSettingsStore,
} from '../testing/fakes.ts';
import { approveRun } from './approve-run.ts';
import { cancelRun } from './cancel-run.ts';
import { deleteConversation } from './delete-conversation.ts';
import { getCapability } from './get-capability.ts';
import { getConversationMessages } from './get-conversation-messages.ts';
import { getSettings } from './get-settings.ts';
import { listCapabilities } from './list-capabilities.ts';
import { listConversations } from './list-conversations.ts';
import { RunExecutor } from './run-executor.ts';
import { startRun } from './start-run.ts';
import { streamRunEvents } from './stream-run-events.ts';
import { updateSettings } from './update-settings.ts';

function createTestCapability(
  id: string,
  events: StreamEventPayload[] = [{ type: 'text.delta', text: 'hi' }],
): Capability {
  return {
    id,
    title: id,
    description: `Test capability: ${id}`,
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.unknown(),
    settingsSchema: z.object({}),
    async *execute(_input: unknown, _ctx: ExecutionContext): AsyncIterable<StreamEventPayload> {
      for (const e of events) {
        yield e;
      }
    },
  };
}

function createRegistry(caps: Capability[]) {
  return {
    list: () => caps,
    get: (id: string) => caps.find((c) => c.id === id),
  };
}

describe('startRun', () => {
  it('creates a run and returns runId', async () => {
    const runStore = createFakeRunStore();
    const eventLog = createFakeEventLog();
    const eventBus = createFakeEventBus();
    const clock = createFakeClock();
    const idGen = createFakeIdGen('run');
    const logger = createFakeLogger();
    const cap = createTestCapability('simple-chat');
    const registry = createRegistry([cap]);
    const executor = new RunExecutor({ runStore, eventLog, eventBus, clock, logger });

    const result = await startRun(
      { capabilityRegistry: registry, runStore, idGen, clock, executor, logger },
      { capabilityId: 'simple-chat', input: { message: 'hello' } },
      new AbortController().signal,
    );

    expect(result.runId).toBe('run-000000000001');
    await new Promise((r) => setTimeout(r, 50));
    const stored = await runStore.get('run-000000000001');
    expect(stored).toBeDefined();
  });

  it('throws NotFoundError for unknown capability', async () => {
    const registry = createRegistry([]);
    const deps = {
      capabilityRegistry: registry,
      runStore: createFakeRunStore(),
      idGen: createFakeIdGen(),
      clock: createFakeClock(),
      executor: {} as RunExecutor,
      logger: createFakeLogger(),
    };
    await expect(
      startRun(deps, { capabilityId: 'unknown', input: {} }, new AbortController().signal),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('streamRunEvents', () => {
  it('yields catchup events from the log', async () => {
    const runStore = createFakeRunStore();
    const eventLog = createFakeEventLog();
    const eventBus = createFakeEventBus();

    await runStore.create('run-1', 'cap', '2026-01-01T00:00:00Z');
    await eventLog.append({
      runId: 'run-1',
      seq: 0,
      ts: '2026-01-01T00:00:00Z',
      type: 'run.started',
      capabilityId: 'cap',
      input: {},
    });
    await eventLog.append({
      runId: 'run-1',
      seq: 1,
      ts: '2026-01-01T00:00:00Z',
      type: 'run.completed',
      output: null,
    });

    const events = [];
    for await (const e of streamRunEvents({ runStore, eventLog, eventBus }, 'run-1')) {
      events.push(e);
    }

    expect(events.map((e) => e.type)).toEqual(['run.started', 'run.completed']);
  });

  it('resumes from fromSeq', async () => {
    const runStore = createFakeRunStore();
    const eventLog = createFakeEventLog();
    const eventBus = createFakeEventBus();

    await runStore.create('run-2', 'cap', '2026-01-01T00:00:00Z');
    for (let i = 0; i < 5; i++) {
      await eventLog.append({
        runId: 'run-2',
        seq: i,
        ts: '2026-01-01T00:00:00Z',
        type: 'text.delta',
        text: `chunk-${i}`,
      });
    }
    await eventLog.append({
      runId: 'run-2',
      seq: 5,
      ts: '2026-01-01T00:00:00Z',
      type: 'run.completed',
      output: null,
    });

    const events = [];
    for await (const e of streamRunEvents({ runStore, eventLog, eventBus }, 'run-2', 3)) {
      events.push(e);
    }

    expect(events[0]?.seq).toBe(3);
    expect(events.length).toBe(3);
  });

  it('throws NotFoundError for unknown run', async () => {
    const deps = {
      runStore: createFakeRunStore(),
      eventLog: createFakeEventLog(),
      eventBus: createFakeEventBus(),
    };
    const iter = streamRunEvents(deps, 'nonexistent');
    await expect(iter.next()).rejects.toThrow(NotFoundError);
  });
});

describe('approveRun', () => {
  it('resolves a pending approval', async () => {
    const runStore = createFakeRunStore();
    const approvalStore = createFakeApprovalStore();
    const clock = createFakeClock();

    await runStore.create('run-1', 'cap', '2026-01-01T00:00:00Z');
    await approvalStore.createPending({
      id: 'apr-1',
      runId: 'run-1',
      payload: { plan: 'do stuff' },
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
    });

    await approveRun({ runStore, approvalStore, clock }, 'run-1', 'apr-1', { kind: 'approve' });

    const resolved = await approvalStore.get('apr-1');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.decision).toEqual({ kind: 'approve' });
  });

  it('throws NotFoundError for unknown run', async () => {
    const deps = {
      runStore: createFakeRunStore(),
      approvalStore: createFakeApprovalStore(),
      clock: createFakeClock(),
    };
    await expect(approveRun(deps, 'nope', 'apr-1', { kind: 'approve' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws ConflictError for already resolved approval', async () => {
    const runStore = createFakeRunStore();
    const approvalStore = createFakeApprovalStore();
    const clock = createFakeClock();

    await runStore.create('run-1', 'cap', '2026-01-01T00:00:00Z');
    await approvalStore.createPending({
      id: 'apr-1',
      runId: 'run-1',
      payload: {},
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await approvalStore.resolve('apr-1', { kind: 'approve' }, '2026-01-01T00:00:01Z');

    await expect(
      approveRun({ runStore, approvalStore, clock }, 'run-1', 'apr-1', { kind: 'approve' }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('cancelRun', () => {
  it('aborts the controller for an existing run', async () => {
    const runStore = createFakeRunStore();
    await runStore.create('run-1', 'cap', '2026-01-01T00:00:00Z');

    const controller = new AbortController();
    await cancelRun({ runStore }, 'run-1', controller);
    expect(controller.signal.aborted).toBe(true);
  });

  it('throws NotFoundError for unknown run', async () => {
    const deps = { runStore: createFakeRunStore() };
    await expect(cancelRun(deps, 'nope', new AbortController())).rejects.toThrow(NotFoundError);
  });
});

describe('listCapabilities', () => {
  it('returns all registered capabilities', () => {
    const caps = [createTestCapability('a'), createTestCapability('b')];
    const result = listCapabilities({ capabilityRegistry: createRegistry(caps) });
    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('getCapability', () => {
  it('returns capability by id', () => {
    const cap = createTestCapability('test');
    const result = getCapability({ capabilityRegistry: createRegistry([cap]) }, 'test');
    expect(result.id).toBe('test');
  });

  it('throws NotFoundError for unknown id', () => {
    expect(() => getCapability({ capabilityRegistry: createRegistry([]) }, 'x')).toThrow(
      NotFoundError,
    );
  });
});

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

describe('settings use cases', () => {
  it('getSettings merges global with scoped', async () => {
    const store = createFakeSettingsStore();
    await store.set('global', 'model', 'gpt-4');
    await store.set('simple-chat', 'model', 'claude');
    await store.set('simple-chat', 'temperature', 0.7);

    const result = await getSettings({ settingsStore: store }, 'simple-chat');
    expect(result).toEqual({ model: 'claude', temperature: 0.7 });
  });

  it('getSettings returns only global when scope is global', async () => {
    const store = createFakeSettingsStore();
    await store.set('global', 'model', 'gpt-4');

    const result = await getSettings({ settingsStore: store }, 'global');
    expect(result).toEqual({ model: 'gpt-4' });
  });

  it('updateSettings persists and deletes null values', async () => {
    const store = createFakeSettingsStore();
    await updateSettings({ settingsStore: store }, 'global', { model: 'gpt-4', temp: 0.5 });
    expect(await store.get('global', 'model')).toBe('gpt-4');

    await updateSettings({ settingsStore: store }, 'global', { model: null });
    expect(await store.get('global', 'model')).toBeUndefined();
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
