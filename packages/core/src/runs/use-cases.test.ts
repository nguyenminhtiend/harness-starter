import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import type { CapabilityDefinition } from '../domain/capability.ts';
import { ConflictError, NotFoundError } from '../domain/errors.ts';
import {
  createFakeApprovalStore,
  createFakeClock,
  createFakeConversationStore,
  createFakeEventBus,
  createFakeEventLog,
  createFakeIdGen,
  createFakeLogger,
  createFakeRunStore,
} from '../testing/fakes.ts';
import { approveRun } from './approve-run.ts';
import { cancelRun } from './cancel-run.ts';
import { RunExecutor } from './run-executor.ts';
import { startRun } from './start-run.ts';
import { streamRunEvents } from './stream-run-events.ts';

function createTestCapability(id: string): CapabilityDefinition {
  return {
    id,
    title: id,
    description: `Test capability: ${id}`,
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.unknown(),
    settingsSchema: z.object({}),
    runner: {
      kind: 'agent',
      build: () =>
        ({
          stream: async () => ({
            fullStream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'text-delta', payload: { text: 'hi' } });
                controller.close();
              },
            }),
          }),
        }) as never,
      extractPrompt: () => 'test',
    },
  };
}

function createRegistry(caps: CapabilityDefinition[]) {
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
    const conversationStore = createFakeConversationStore();
    const cap = createTestCapability('simple-chat');
    const registry = createRegistry([cap]);
    const executor = new RunExecutor({ runStore, eventLog, eventBus, clock, logger });

    const result = await startRun(
      {
        capabilityRegistry: registry,
        runStore,
        conversationStore,
        idGen,
        clock,
        executor,
        logger,
      },
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
      conversationStore: createFakeConversationStore(),
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
