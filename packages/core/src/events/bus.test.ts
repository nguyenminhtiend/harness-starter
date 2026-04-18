import { describe, expect, mock, test } from 'bun:test';
import type { EventBus } from './bus.ts';
import { createEventBus } from './bus.ts';

describe('createEventBus', () => {
  test('on + emit delivers payload', () => {
    const bus = createEventBus();
    const handler = mock();
    bus.on('run.start', handler);
    const payload = { runId: 'r1', conversationId: 'c1', input: { userMessage: 'hi' } };
    bus.emit('run.start', payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  test('multiple listeners per event', () => {
    const bus = createEventBus();
    const h1 = mock();
    const h2 = mock();
    bus.on('run.start', h1);
    bus.on('run.start', h2);
    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} } as never);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe stops delivery', () => {
    const bus = createEventBus();
    const handler = mock();
    const unsub = bus.on('run.finish', handler);
    bus.emit('run.finish', { runId: 'r1', result: {} } as never);
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    bus.emit('run.finish', { runId: 'r1', result: {} } as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('listeners called synchronously in registration order', () => {
    const bus = createEventBus();
    const order: number[] = [];
    bus.on('turn.start', () => order.push(1));
    bus.on('turn.start', () => order.push(2));
    bus.on('turn.start', () => order.push(3));
    bus.emit('turn.start', { runId: 'r1', turn: 1 });
    expect(order).toEqual([1, 2, 3]);
  });

  test('emitting event with no listeners does not throw', () => {
    const bus = createEventBus();
    expect(() =>
      bus.emit('run.error', { runId: 'r1', error: new Error('test') } as never),
    ).not.toThrow();
  });

  test('different events are independent', () => {
    const bus = createEventBus();
    const startHandler = mock();
    const finishHandler = mock();
    bus.on('run.start', startHandler);
    bus.on('run.finish', finishHandler);
    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} } as never);
    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(finishHandler).toHaveBeenCalledTimes(0);
  });

  test('supports all event types from HarnessEvents', () => {
    const bus: EventBus = createEventBus();
    const handler = mock();

    bus.on('provider.usage', handler);
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      costUSD: 0.01,
    });
    expect(handler).toHaveBeenCalledTimes(1);

    const toolHandler = mock();
    bus.on('tool.start', toolHandler);
    bus.emit('tool.start', { runId: 'r1', toolName: 'readFile', args: { path: '/foo' } });
    expect(toolHandler).toHaveBeenCalledTimes(1);
  });
});
