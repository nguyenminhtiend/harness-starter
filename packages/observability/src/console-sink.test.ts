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
    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[run]');
    expect(msg).toContain('started');
  });

  test('logs tool.finish at normal level', () => {
    consoleSink(bus);
    bus.emit('tool.finish', { runId: 'r1', toolName: 'fs', result: 'ok', durationMs: 42 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('fs');
    expect(msg).toContain('42ms');
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
    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[provider]');
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
    expect(messages[0]).toContain('[run]');
    expect(messages[1]).toContain('[budget]');
  });

  test('unsubscribe stops logging', () => {
    const unsub = consoleSink(bus);
    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    expect(logSpy).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit('run.start', { runId: 'r2', conversationId: 'c2', input: {} });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  test('silent level produces zero console output for any event', () => {
    consoleSink(bus, { level: 'silent' });

    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('run.finish', { runId: 'r1', result: { turns: 3 } });
    bus.emit('run.error', {
      runId: 'r1',
      error: { name: 'HarnessError', message: 'fail', code: 'HARNESS_ERROR' } as never,
    });
    bus.emit('turn.start', { runId: 'r1', turn: 1 });
    bus.emit('tool.start', { runId: 'r1', toolName: 'fs', args: {} });
    bus.emit('provider.call', { runId: 'r1', providerId: 'p1', request: { messages: [] } });
    bus.emit('budget.exceeded', { runId: 'r1', kind: 'usd', spent: 10, limit: 5 });

    expect(logSpy).not.toHaveBeenCalled();
  });

  test('quiet run.start formats as readable one-liner', () => {
    consoleSink(bus, { level: 'quiet' });
    bus.emit('run.start', {
      runId: 'abcd1234-5678-9abc-def0-123456789abc',
      conversationId: 'c1',
      input: {},
    });

    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[run]');
    expect(msg).toContain('started');
    expect(msg).toContain('abcd1234');
    expect(msg).not.toContain('JSON');
    expect(msg).not.toContain('{');
  });

  test('quiet run.finish formats with tokens and turns', () => {
    consoleSink(bus, { level: 'quiet' });
    bus.emit('run.finish', {
      runId: 'r1',
      result: { turns: 3, usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 } },
    });

    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[run]');
    expect(msg).toContain('done');
    expect(msg).toContain('70 tokens');
    expect(msg).toContain('3 turns');
  });

  test('quiet run.error formats with message', () => {
    consoleSink(bus, { level: 'quiet' });
    bus.emit('run.error', {
      runId: 'r1',
      error: { name: 'HarnessError', message: 'something broke', code: 'HARNESS_ERROR' } as never,
    });

    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[error]');
    expect(msg).toContain('something broke');
  });

  test('quiet budget.exceeded formats with kind and amounts', () => {
    consoleSink(bus, { level: 'quiet' });
    bus.emit('budget.exceeded', { runId: 'r1', kind: 'usd', spent: 10, limit: 5 });

    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[budget]');
    expect(msg).toContain('usd');
    expect(msg).toContain('10');
    expect(msg).toContain('5');
  });

  test('normal turn.start formats as readable one-liner', () => {
    consoleSink(bus, { level: 'normal' });
    bus.emit('turn.start', { runId: 'r1', turn: 2 });

    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[turn]');
    expect(msg).toContain('2');
  });

  test('normal tool.start formats with tool name', () => {
    consoleSink(bus, { level: 'normal' });
    bus.emit('tool.start', { runId: 'r1', toolName: 'readFile', args: { path: '/tmp' } });

    const msg = logSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('[tool]');
    expect(msg).toContain('readFile');
  });
});
