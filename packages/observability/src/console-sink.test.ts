import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { EventBus } from '@harness/core';
import { createEventBus } from '@harness/core';
import { consoleSink } from './console-sink.ts';

let bus: EventBus;
const logSpy = mock(() => {});
const originalLog = console.log;

beforeEach(() => {
  bus = createEventBus();
  logSpy.mockReset();
  console.log = logSpy;
});

afterAll(() => {
  console.log = originalLog;
});

describe('consoleSink', () => {
  test('returns an unsubscribe function', () => {
    const unsub = consoleSink(bus);
    expect(typeof unsub).toBe('function');
  });

  test('logs run.start at default (normal) level', () => {
    consoleSink(bus);
    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = logSpy.mock.calls[0]![0] as string;
    expect(msg).toContain('[harness:run.start]');
  });

  test('logs tool.finish at normal level', () => {
    consoleSink(bus);
    bus.emit('tool.finish', { runId: 'r1', toolName: 'fs', result: 'ok', durationMs: 42 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = logSpy.mock.calls[0]![0] as string;
    expect(msg).toContain('[harness:tool.finish]');
  });

  test('does not log provider.call at normal level', () => {
    consoleSink(bus, { level: 'normal' });
    bus.emit('provider.call', { runId: 'r1', providerId: 'p1', request: { messages: [] } });

    expect(logSpy).not.toHaveBeenCalled();
  });

  test('logs provider.call at verbose level', () => {
    consoleSink(bus, { level: 'verbose' });
    bus.emit('provider.call', { runId: 'r1', providerId: 'p1', request: { messages: [] } });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = logSpy.mock.calls[0]![0] as string;
    expect(msg).toContain('[harness:provider.call]');
  });

  test('quiet level only logs run.start, run.finish, run.error, budget.exceeded', () => {
    consoleSink(bus, { level: 'quiet' });

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('turn.start', { runId: 'r1', turn: 1 });
    bus.emit('tool.start', { runId: 'r1', toolName: 'fs', args: {} });
    bus.emit('provider.call', { runId: 'r1', providerId: 'p1', request: { messages: [] } });
    bus.emit('budget.exceeded', { runId: 'r1', kind: 'usd', spent: 10, limit: 5 });

    expect(logSpy).toHaveBeenCalledTimes(2);
    const messages = logSpy.mock.calls.map((c) => c[0] as string);
    expect(messages[0]).toContain('[harness:run.start]');
    expect(messages[1]).toContain('[harness:budget.exceeded]');
  });

  test('unsubscribe stops logging', () => {
    const unsub = consoleSink(bus);
    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    expect(logSpy).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit('run.start', { runId: 'r2', conversationId: 'c2', input: {} });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  test('log format includes JSON payload', () => {
    consoleSink(bus);
    bus.emit('run.finish', { runId: 'r1', result: { turns: 3 } });

    const msg = logSpy.mock.calls[0]![0] as string;
    expect(msg).toContain('[harness:run.finish]');
    expect(msg).toContain('"runId"');
    expect(msg).toContain('"r1"');
  });
});
