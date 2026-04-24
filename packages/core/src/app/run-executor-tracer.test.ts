import { describe, expect, it } from 'bun:test';
import type { CapabilityEvent, ExecutionContext } from '../domain/capability.ts';
import { Run } from '../domain/run.ts';
import type { Span, Tracer } from '../ports/tracer.ts';
import {
  createFakeClock,
  createFakeEventBus,
  createFakeEventLog,
  createFakeLogger,
  createFakeRunStore,
} from '../testing/fakes.ts';
import { RunExecutor } from './run-executor.ts';

interface SpanRecord {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  status?: 'ok' | 'error';
  ended: boolean;
}

function createCapturingTracer(): { tracer: Tracer; spans: SpanRecord[] } {
  const spans: SpanRecord[] = [];
  const tracer: Tracer = {
    startSpan(name, attributes) {
      const record: SpanRecord = { name, attributes, ended: false };
      spans.push(record);
      const span: Span = {
        end() {
          record.ended = true;
        },
        setStatus(status) {
          record.status = status;
        },
        setAttribute(key, value) {
          if (!record.attributes) {
            record.attributes = {};
          }
          record.attributes[key] = value;
        },
      };
      return span;
    },
  };
  return { tracer, spans };
}

function createTestCapability(events: CapabilityEvent[]) {
  return {
    async *execute(_input: unknown, _ctx: ExecutionContext): AsyncIterable<CapabilityEvent> {
      for (const e of events) {
        yield e;
      }
    },
  };
}

function setup(tracer?: Tracer) {
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
    tracer,
  });
  return { runStore, eventLog, eventBus, clock, logger, executor };
}

describe('RunExecutor tracer integration', () => {
  it('creates a span for execution when tracer is provided', async () => {
    const { tracer, spans } = createCapturingTracer();
    const { executor } = setup(tracer);
    const run = new Run('run-t1', 'test-cap', '2026-04-24T00:00:00.000Z');
    const capability = createTestCapability([{ type: 'text-delta', text: 'hi' }]);

    await executor.execute(run, capability, {}, new AbortController().signal);

    const execSpan = spans.find((s) => s.name === 'run.execute');
    expect(execSpan).toBeDefined();
    expect(execSpan?.ended).toBe(true);
    expect(execSpan?.status).toBe('ok');
    expect(execSpan?.attributes?.runId).toBe('run-t1');
    expect(execSpan?.attributes?.capabilityId).toBe('test-cap');
  });

  it('sets span status to error when capability throws', async () => {
    const { tracer, spans } = createCapturingTracer();
    const { executor } = setup(tracer);
    const run = new Run('run-t2', 'test-cap', '2026-04-24T00:00:00.000Z');
    const capability = {
      async *execute(): AsyncIterable<CapabilityEvent> {
        yield { type: 'text-delta' as const, text: 'before boom' };
        throw new Error('boom');
      },
    };

    await executor.execute(run, capability, {}, new AbortController().signal);

    const execSpan = spans.find((s) => s.name === 'run.execute');
    expect(execSpan?.status).toBe('error');
    expect(execSpan?.ended).toBe(true);
  });

  it('works without tracer (optional)', async () => {
    const { executor } = setup();
    const run = new Run('run-t3', 'test-cap', '2026-04-24T00:00:00.000Z');
    const capability = createTestCapability([{ type: 'text-delta', text: 'hi' }]);

    await executor.execute(run, capability, {}, new AbortController().signal);
    expect(run.status).toBe('completed');
  });

  it('logs run start and completion with durationMs', async () => {
    const logs: Array<{ msg: string; data?: Record<string, unknown> }> = [];
    const capturingLogger = {
      debug() {},
      info(msg: string, data?: Record<string, unknown>) {
        logs.push({ msg, data });
      },
      warn() {},
      error() {},
      child() {
        return capturingLogger;
      },
    };

    const { runStore, eventLog, eventBus, clock } = setup();
    const executor = new RunExecutor({
      runStore,
      eventLog,
      eventBus,
      clock,
      logger: capturingLogger,
    });

    const run = new Run('run-t4', 'test-cap', '2026-04-24T00:00:00.000Z');
    const capability = createTestCapability([{ type: 'text-delta', text: 'hi' }]);

    await executor.execute(run, capability, {}, new AbortController().signal);

    const startLog = logs.find((l) => l.msg === 'Run started');
    expect(startLog).toBeDefined();
    expect(startLog?.data?.runId).toBe('run-t4');
    expect(startLog?.data?.capabilityId).toBe('test-cap');

    const completeLog = logs.find((l) => l.msg === 'Run finished');
    expect(completeLog).toBeDefined();
    expect(completeLog?.data?.runId).toBe('run-t4');
    expect(typeof completeLog?.data?.durationMs).toBe('number');
  });
});
