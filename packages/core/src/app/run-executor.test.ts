import { describe, expect, it } from 'bun:test';
import type { CapabilityDefinition } from '../domain/capability.ts';
import { Run } from '../domain/run.ts';
import type { SessionEvent, StreamEventPayload } from '../domain/session-event.ts';
import type { ApprovalDecision, ApprovalQueue } from '../ports/index.ts';
import {
  createFakeApprovalStore,
  createFakeClock,
  createFakeEventBus,
  createFakeEventLog,
  createFakeLogger,
  createFakeRunStore,
} from '../testing/fakes.ts';
import { RunExecutor } from './run-executor.ts';

function createFakeApprovalQueue(): ApprovalQueue & {
  pendingResolvers: Map<string, (decision: ApprovalDecision) => void>;
} {
  const store = createFakeApprovalStore();
  const pendingResolvers = new Map<string, (decision: ApprovalDecision) => void>();

  return {
    pendingResolvers,
    async request(approvalId, runId, payload, createdAt) {
      await store.createPending({
        id: approvalId,
        runId,
        payload,
        status: 'pending',
        createdAt,
      });
      return new Promise<ApprovalDecision>((resolve) => {
        pendingResolvers.set(approvalId, resolve);
      });
    },
    async resolve(approvalId, decision, resolvedAt) {
      await store.resolve(approvalId, decision, resolvedAt);
      const resolver = pendingResolvers.get(approvalId);
      if (resolver) {
        pendingResolvers.delete(approvalId);
        resolver(decision);
      }
    },
  };
}

function fakeAgentCapability(events: StreamEventPayload[]): CapabilityDefinition {
  return {
    id: 'test-cap',
    title: 'Test',
    description: 'Test capability',
    inputSchema: { parse: (v: unknown) => v } as never,
    outputSchema: { parse: (v: unknown) => v } as never,
    settingsSchema: { parse: (v: unknown) => v } as never,
    runner: {
      kind: 'agent',
      build: () =>
        ({
          stream: async () => ({
            fullStream: new ReadableStream({
              start(controller) {
                for (const e of events) {
                  controller.enqueue(toStreamChunk(e));
                }
                controller.close();
              },
            }),
          }),
        }) as never,
      extractPrompt: () => 'test',
    },
  };
}

function toStreamChunk(e: StreamEventPayload): Record<string, unknown> {
  switch (e.type) {
    case 'text.delta':
      return { type: 'text-delta', payload: { text: e.text } };
    case 'step.finished':
      return { type: 'step-finish', payload: { output: {} } };
    case 'plan.proposed':
      return { type: 'custom-plan', payload: { plan: e.plan } };
    case 'artifact':
      return { type: 'artifact', payload: { name: e.name, data: e.data } };
    default:
      return { type: 'unknown', payload: e };
  }
}

function fakeAbortableAgentCapability(events: StreamEventPayload[]): CapabilityDefinition {
  return {
    id: 'test-cap',
    title: 'Test',
    description: 'Test capability',
    inputSchema: { parse: (v: unknown) => v } as never,
    outputSchema: { parse: (v: unknown) => v } as never,
    settingsSchema: { parse: (v: unknown) => v } as never,
    runner: {
      kind: 'agent',
      build: () =>
        ({
          stream: async (_prompt: string, opts: { abortSignal?: AbortSignal }) => ({
            fullStream: new ReadableStream({
              start(controller) {
                for (const e of events) {
                  if (opts?.abortSignal?.aborted) {
                    controller.close();
                    return;
                  }
                  controller.enqueue(toStreamChunk(e));
                }
                controller.close();
              },
            }),
          }),
        }) as never,
      extractPrompt: () => 'test',
    },
  };
}

function fakeThrowingCapability(): CapabilityDefinition {
  return {
    id: 'test-cap',
    title: 'Test',
    description: 'Test capability',
    inputSchema: { parse: (v: unknown) => v } as never,
    outputSchema: { parse: (v: unknown) => v } as never,
    settingsSchema: { parse: (v: unknown) => v } as never,
    runner: {
      kind: 'agent',
      build: () =>
        ({
          stream: async () => ({
            fullStream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'text-delta', payload: { text: 'start' } });
                controller.error(new Error('capability exploded'));
              },
            }),
          }),
        }) as never,
      extractPrompt: () => 'test',
    },
  };
}

function fakeHitlCapability(): CapabilityDefinition {
  return {
    id: 'research',
    title: 'Research',
    description: 'Research with HITL',
    inputSchema: { parse: (v: unknown) => v } as never,
    outputSchema: { parse: (v: unknown) => v } as never,
    settingsSchema: { parse: (v: unknown) => v } as never,
    supportsApproval: true,
    runner: {
      kind: 'workflow',
      build: () =>
        ({
          createRun: async () => ({
            start: async () => ({
              status: 'suspended',
              steps: { plan: { status: 'success', output: { plan: { summary: 'Test plan' } } } },
            }),
            resume: async () => ({
              status: 'success',
              result: { text: 'Final report' },
            }),
          }),
        }) as never,
      extractInput: () => ({}),
      extractPlan: (steps) => {
        const planStep = steps.plan as { status: string; output?: { plan?: unknown } } | undefined;
        return planStep?.status === 'success' ? planStep.output?.plan : undefined;
      },
      approveStepId: 'approve',
    },
  };
}

function fakeRejectableHitlCapability(): CapabilityDefinition {
  return {
    id: 'research',
    title: 'Research',
    description: 'Research with HITL',
    inputSchema: { parse: (v: unknown) => v } as never,
    outputSchema: { parse: (v: unknown) => v } as never,
    settingsSchema: { parse: (v: unknown) => v } as never,
    supportsApproval: true,
    runner: {
      kind: 'workflow',
      build: () =>
        ({
          createRun: async () => ({
            start: async () => ({
              status: 'suspended',
              steps: { plan: { status: 'success', output: { plan: { summary: 'Test plan' } } } },
            }),
            resume: async () => ({
              status: 'success',
              result: { text: 'Final report' },
            }),
          }),
        }) as never,
      extractInput: () => ({}),
      extractPlan: (steps) => {
        const planStep = steps.plan as { status: string; output?: { plan?: unknown } } | undefined;
        return planStep?.status === 'success' ? planStep.output?.plan : undefined;
      },
      approveStepId: 'approve',
    },
  };
}

function setup(opts?: { approvalQueue?: ApprovalQueue }) {
  const runStore = createFakeRunStore();
  const eventLog = createFakeEventLog();
  const eventBus = createFakeEventBus();
  const clock = createFakeClock();
  const logger = createFakeLogger();
  const executor = new RunExecutor({
    runStore,
    eventLog,
    eventBus,
    clock,
    logger,
    approvalQueue: opts?.approvalQueue,
  });
  return { runStore, eventLog, eventBus, clock, logger, executor };
}

describe('RunExecutor', () => {
  it('executes an agent capability and produces correct event sequence', async () => {
    const { eventLog, eventBus, executor } = setup();
    const run = new Run('run-1', 'test-cap', '2026-04-24T00:00:00.000Z');
    const capability = fakeAgentCapability([
      { type: 'text.delta', text: 'Hello' },
      { type: 'text.delta', text: ' world' },
    ]);

    const collected: SessionEvent[] = [];
    const sub = eventBus.subscribe('run-1');
    const collectPromise = (async () => {
      for await (const event of sub) {
        collected.push(event);
        if (event.type === 'run.completed' || event.type === 'run.failed') {
          break;
        }
      }
    })();

    await executor.execute(run, capability, { message: 'hi' }, new AbortController().signal);
    await collectPromise;

    expect(collected.map((e) => e.type)).toEqual([
      'run.started',
      'text.delta',
      'text.delta',
      'run.completed',
    ]);

    const persisted = await eventLog.read('run-1');
    expect(persisted.length).toBe(4);

    const seqs = persisted.map((e) => e.seq);
    expect(seqs).toEqual([0, 1, 2, 3]);
  });

  it('marks run as failed when capability throws', async () => {
    const { runStore, eventLog, executor } = setup();
    const run = new Run('run-2', 'test-cap', '2026-04-24T00:00:00.000Z');
    await runStore.create('run-2', 'test-cap', '2026-04-24T00:00:00.000Z');

    const capability = fakeThrowingCapability();

    await executor.execute(run, capability, {}, new AbortController().signal);

    expect(run.status).toBe('failed');
    const events = await eventLog.read('run-2');
    const types = events.map((e) => e.type);
    expect(types).toContain('run.started');
    expect(types).toContain('run.failed');
  });

  it('produces run.cancelled when aborted mid-stream', async () => {
    const { eventLog, executor } = setup();
    const run = new Run('run-3', 'test-cap', '2026-04-24T00:00:00.000Z');
    const controller = new AbortController();

    const capability = fakeAbortableAgentCapability([
      { type: 'text.delta', text: 'a' },
      { type: 'text.delta', text: 'b' },
      { type: 'text.delta', text: 'c' },
    ]);

    controller.abort();
    await executor.execute(run, capability, {}, controller.signal);

    expect(run.status).toBe('cancelled');
    const events = await eventLog.read('run-3');
    const last = events[events.length - 1];
    expect(last?.type).toBe('run.cancelled');
  });

  it('updates run store status on completion', async () => {
    const { runStore, executor } = setup();
    const run = new Run('run-4', 'test-cap', '2026-04-24T00:00:00.000Z');
    await runStore.create('run-4', 'test-cap', '2026-04-24T00:00:00.000Z');

    const capability = fakeAgentCapability([{ type: 'text.delta', text: 'done' }]);
    await executor.execute(run, capability, {}, new AbortController().signal);

    const stored = await runStore.get('run-4');
    expect(stored?.status).toBe('completed');
  });

  it('emits approval.requested and approval.resolved for HITL flow', async () => {
    const approvalQueue = createFakeApprovalQueue();
    const { eventLog, eventBus, executor } = setup({ approvalQueue });
    const run = new Run('run-5', 'research', '2026-04-24T00:00:00.000Z');
    const capability = fakeHitlCapability();

    const collected: SessionEvent[] = [];
    const sub = eventBus.subscribe('run-5');
    const collectPromise = (async () => {
      for await (const event of sub) {
        collected.push(event);
        if (event.type === 'run.completed' || event.type === 'run.failed') {
          break;
        }
      }
    })();

    const execPromise = executor.execute(run, capability, {}, new AbortController().signal);

    await new Promise((r) => setTimeout(r, 20));
    await approvalQueue.resolve('run-5-approval', { kind: 'approve' }, '2026-04-24T00:01:00.000Z');

    await execPromise;
    await collectPromise;

    const types = collected.map((e) => e.type);
    expect(types).toEqual([
      'run.started',
      'step.finished',
      'plan.proposed',
      'approval.requested',
      'approval.resolved',
      'artifact',
      'run.completed',
    ]);

    const persisted = await eventLog.read('run-5');
    expect(persisted.length).toBe(7);
  });

  it('stops after rejection and emits run.completed', async () => {
    const approvalQueue = createFakeApprovalQueue();
    const { eventLog, executor } = setup({ approvalQueue });
    const run = new Run('run-6', 'research', '2026-04-24T00:00:00.000Z');
    const capability = fakeRejectableHitlCapability();

    const execPromise = executor.execute(run, capability, {}, new AbortController().signal);

    await new Promise((r) => setTimeout(r, 20));
    await approvalQueue.resolve(
      'run-6-approval',
      { kind: 'reject', reason: 'bad plan' },
      '2026-04-24T00:01:00.000Z',
    );

    await execPromise;

    const events = await eventLog.read('run-6');
    const types = events.map((e) => e.type);
    expect(types).toContain('approval.requested');
    expect(types).toContain('approval.resolved');
    expect(types).not.toContain('artifact');
    expect(types).toContain('run.completed');
  });

  it('transitions run status to suspended during approval wait', async () => {
    const approvalQueue = createFakeApprovalQueue();
    const { runStore, executor } = setup({ approvalQueue });
    const run = new Run('run-7', 'research', '2026-04-24T00:00:00.000Z');
    await runStore.create('run-7', 'research', '2026-04-24T00:00:00.000Z');
    const capability = fakeHitlCapability();

    const execPromise = executor.execute(run, capability, {}, new AbortController().signal);

    await new Promise((r) => setTimeout(r, 20));

    const stored = await runStore.get('run-7');
    expect(stored?.status).toBe('suspended');

    await approvalQueue.resolve('run-7-approval', { kind: 'approve' }, '2026-04-24T00:01:00.000Z');
    await execPromise;

    const after = await runStore.get('run-7');
    expect(after?.status).toBe('completed');
  });
});
