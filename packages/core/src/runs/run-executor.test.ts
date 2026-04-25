import { describe, expect, it } from 'bun:test';
import pino from 'pino';
import { z } from 'zod';
import type { CapabilityDefinition } from '../domain/capability.ts';
import { Run } from '../domain/run.ts';
import type { SessionEvent, StreamEventPayload } from '../domain/session-event.ts';
import type { ApprovalCoordinator } from '../storage/approval-coordinator.ts';
import {
  createFakeApprovalCoordinator,
  createFakeClock,
  createFakeEventBus,
  createFakeEventLog,
  createFakeLogger,
  createFakeRunStore,
} from '../testing/fakes.ts';
import { RunExecutor } from './run-executor.ts';

function fakeAgentCapability(events: StreamEventPayload[]): CapabilityDefinition {
  return {
    id: 'test-cap',
    title: 'Test',
    description: 'Test capability',
    inputSchema: { parse: (v: unknown) => v } as never,
    outputSchema: { parse: (v: unknown) => v } as never,
    settingsSchema: { parse: (v: unknown) => v } as never,
    runner: async function* () {
      for (const e of events) {
        yield e;
      }
    },
  };
}

function fakeAbortableAgentCapability(events: StreamEventPayload[]): CapabilityDefinition {
  return {
    id: 'test-cap',
    title: 'Test',
    description: 'Test capability',
    inputSchema: { parse: (v: unknown) => v } as never,
    outputSchema: { parse: (v: unknown) => v } as never,
    settingsSchema: { parse: (v: unknown) => v } as never,
    runner: async function* (_input, ctx) {
      for (const e of events) {
        if (ctx.signal.aborted) {
          return;
        }
        yield e;
      }
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
    runner: async function* () {
      yield { type: 'text.delta' as const, text: 'start' };
      throw new Error('capability exploded');
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
    runner: async function* (_input, ctx) {
      yield { type: 'step.finished' as const };
      yield { type: 'plan.proposed' as const, plan: { summary: 'Test plan' } };

      const decision = await ctx.approvals.request(`${ctx.runId}-approval`, {
        summary: 'Test plan',
      });
      if (decision.kind === 'reject') {
        return;
      }
      yield { type: 'artifact' as const, name: 'result', data: { text: 'Final report' } };
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
    runner: async function* (_input, ctx) {
      yield { type: 'step.finished' as const };
      yield { type: 'plan.proposed' as const, plan: { summary: 'Test plan' } };

      const decision = await ctx.approvals.request(`${ctx.runId}-approval`, {
        summary: 'Test plan',
      });
      if (decision.kind === 'reject') {
        return;
      }
      yield { type: 'artifact' as const, name: 'result', data: { text: 'Final report' } };
    },
  };
}

function setup(opts?: { approvalCoordinator?: ApprovalCoordinator }) {
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
    approvalCoordinator: opts?.approvalCoordinator,
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
    const approvalCoordinator = createFakeApprovalCoordinator();
    const { eventLog, eventBus, executor } = setup({ approvalCoordinator });
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
    await approvalCoordinator.resolve(
      'run-5-approval',
      { kind: 'approve' },
      '2026-04-24T00:01:00.000Z',
    );

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
    const approvalCoordinator = createFakeApprovalCoordinator();
    const { eventLog, executor } = setup({ approvalCoordinator });
    const run = new Run('run-6', 'research', '2026-04-24T00:00:00.000Z');
    const capability = fakeRejectableHitlCapability();

    const execPromise = executor.execute(run, capability, {}, new AbortController().signal);

    await new Promise((r) => setTimeout(r, 20));
    await approvalCoordinator.resolve(
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
    const approvalCoordinator = createFakeApprovalCoordinator();
    const { runStore, executor } = setup({ approvalCoordinator });
    const run = new Run('run-7', 'research', '2026-04-24T00:00:00.000Z');
    await runStore.create('run-7', 'research', '2026-04-24T00:00:00.000Z');
    const capability = fakeHitlCapability();

    const execPromise = executor.execute(run, capability, {}, new AbortController().signal);

    await new Promise((r) => setTimeout(r, 20));

    const stored = await runStore.get('run-7');
    expect(stored?.status).toBe('suspended');

    await approvalCoordinator.resolve(
      'run-7-approval',
      { kind: 'approve' },
      '2026-04-24T00:01:00.000Z',
    );
    await execPromise;

    const after = await runStore.get('run-7');
    expect(after?.status).toBe('completed');
  });

  it('passes settings via ctx and memory via ctx to runner', async () => {
    let receivedSettings: unknown;
    let receivedMemory: unknown;
    const capability: CapabilityDefinition = {
      id: 'test-cap',
      title: 'Test',
      description: 'Test',
      inputSchema: { parse: (v: unknown) => v } as never,
      outputSchema: { parse: (v: unknown) => v } as never,
      settingsSchema: { parse: (v: unknown) => v } as never,
      runner: async function* (_input, ctx) {
        receivedSettings = ctx.settings;
        receivedMemory = ctx.memory;
        yield { type: 'text.delta' as const, text: '' };
      },
    };

    const { executor } = setup();
    const run = new Run('run-8', 'test-cap', '2026-04-24T00:00:00.000Z');
    await executor.execute(run, capability, {}, new AbortController().signal, {
      settings: { model: 'gpt-4o' },
      memory: { conversationId: 'conv-1' },
    });

    expect(receivedSettings).toEqual({ model: 'gpt-4o' });
    expect(receivedMemory).toEqual({ conversationId: 'conv-1' });
    expect(run.status).toBe('completed');
  });

  it('fails when runner throws', async () => {
    const capability: CapabilityDefinition = {
      id: 'wf-fail',
      title: 'Fail WF',
      description: 'Failing runner',
      inputSchema: { parse: (v: unknown) => v } as never,
      outputSchema: { parse: (v: unknown) => v } as never,
      settingsSchema: { parse: (v: unknown) => v } as never,
      runner: async function* () {
        yield { type: 'text.delta' as const, text: 'before-fail' };
        throw new Error('Workflow failed with status: failed');
      },
    };

    const { eventLog, executor } = setup();
    const run = new Run('run-10', 'wf-fail', '2026-04-24T00:00:00.000Z');
    await executor.execute(run, capability, {}, new AbortController().signal);

    expect(run.status).toBe('failed');
    const events = await eventLog.read('run-10');
    expect(events.map((e) => e.type)).toContain('run.failed');
  });

  it('yields artifact for runner that succeeds without suspension', async () => {
    const capability: CapabilityDefinition = {
      id: 'wf-direct',
      title: 'Direct WF',
      description: 'Runner succeeds immediately',
      inputSchema: { parse: (v: unknown) => v } as never,
      outputSchema: { parse: (v: unknown) => v } as never,
      settingsSchema: { parse: (v: unknown) => v } as never,
      runner: async function* () {
        yield { type: 'artifact' as const, name: 'result', data: { answer: 42 } };
      },
    };

    const { eventLog, executor } = setup();
    const run = new Run('run-11', 'wf-direct', '2026-04-24T00:00:00.000Z');
    await executor.execute(run, capability, {}, new AbortController().signal);

    expect(run.status).toBe('completed');
    const events = await eventLog.read('run-11');
    const types = events.map((e) => e.type);
    expect(types).toEqual(['run.started', 'artifact', 'run.completed']);
  });

  it('fails with INVALID_SETTINGS when settings do not match schema', async () => {
    const capability: CapabilityDefinition = {
      id: 'strict-cap',
      title: 'Strict',
      description: 'Requires model string',
      inputSchema: { parse: (v: unknown) => v } as never,
      outputSchema: { parse: (v: unknown) => v } as never,
      settingsSchema: z.object({ model: z.string() }),
      runner: async function* () {
        yield { type: 'text.delta' as const, text: 'should not reach' };
      },
    };

    const { eventLog, executor } = setup();
    const run = new Run('run-12', 'strict-cap', '2026-04-24T00:00:00.000Z');

    await executor.execute(run, capability, {}, new AbortController().signal, {
      settings: { model: 123 },
    });

    expect(run.status).toBe('failed');
    const events = await eventLog.read('run-12');
    const failEvent = events.find((e) => e.type === 'run.failed');
    expect(failEvent).toBeDefined();
    expect((failEvent as { error: { code: string } }).error.code).toBe('INVALID_SETTINGS');
  });

  it('registerAbort + abort cancels the registered controller', () => {
    const { executor } = setup();
    const controller = new AbortController();
    executor.registerAbort('run-a', controller);

    expect(executor.abort('run-a')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(executor.abort('run-a')).toBe(false);
  });

  it('abort returns false for unknown runId', () => {
    const { executor } = setup();
    expect(executor.abort('nonexistent')).toBe(false);
  });

  it('abortAll cancels all registered controllers', () => {
    const { executor } = setup();
    const c1 = new AbortController();
    const c2 = new AbortController();
    executor.registerAbort('r1', c1);
    executor.registerAbort('r2', c2);

    executor.abortAll();
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(executor.abort('r1')).toBe(false);
  });

  it('cleans up abort controller when run completes', async () => {
    const { executor } = setup();
    const run = new Run('run-cleanup', 'test-cap', '2026-04-24T00:00:00.000Z');
    const controller = new AbortController();

    executor.registerAbort('run-cleanup', controller);

    const capability = fakeAgentCapability([{ type: 'text.delta', text: 'done' }]);
    await executor.execute(run, capability, {}, controller.signal);

    expect(executor.abort('run-cleanup')).toBe(false);
  });

  it('logs stream events with correct levels and summaries', async () => {
    const entries: Record<string, unknown>[] = [];
    const dest: pino.DestinationStream = {
      write(msg: string) {
        entries.push(JSON.parse(msg));
      },
    };
    const capturingLogger = pino({ level: 'debug' }, dest);

    const runStore = createFakeRunStore();
    const eventLog = createFakeEventLog();
    const eventBus = createFakeEventBus();
    const clock = createFakeClock();
    const executor = new RunExecutor({
      runStore,
      eventLog,
      eventBus,
      clock,
      logger: capturingLogger,
    });

    const capability = fakeAgentCapability([
      { type: 'text.delta', text: 'Hello' },
      { type: 'tool.called', tool: 'calc', args: { x: 1 }, callId: 'c1' },
      { type: 'tool.result', callId: 'c1', result: 42 },
      { type: 'text.delta', text: ' world' },
      { type: 'step.finished' },
    ]);

    const run = new Run('run-log', 'test-cap', '2026-04-24T00:00:00.000Z');
    await runStore.create('run-log', 'test-cap', '2026-04-24T00:00:00.000Z');

    await executor.execute(run, capability, { message: 'hi' }, new AbortController().signal);

    const eventLogs = entries.filter((e) => e.msg === 'event');
    const types = eventLogs.map((e) => e.type);

    expect(types).toEqual([
      'text.delta',
      'tool.called',
      'tool.result',
      'text.delta',
      'step.finished',
    ]);

    const deltaLogs = eventLogs.filter((e) => e.type === 'text.delta');
    for (const entry of deltaLogs) {
      expect(entry.level).toBe(20);
    }
    expect(deltaLogs[0]).toMatchObject({ chars: 5 });
    expect(deltaLogs[1]).toMatchObject({ chars: 6 });

    const toolCalledLog = eventLogs.find((e) => e.type === 'tool.called');
    expect(toolCalledLog).toMatchObject({ level: 30, tool: 'calc', callId: 'c1' });

    const toolResultLog = eventLogs.find((e) => e.type === 'tool.result');
    expect(toolResultLog).toMatchObject({ level: 30, callId: 'c1' });

    const stepLog = eventLogs.find((e) => e.type === 'step.finished');
    expect(stepLog).toMatchObject({ level: 30 });
  });
});
