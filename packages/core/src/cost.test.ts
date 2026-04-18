import { describe, expect, test } from 'bun:test';
import type { PriceBook } from './cost.ts';
import { trackCost } from './cost.ts';
import { defaultPrices } from './default-prices.ts';
import { createEventBus } from './events/bus.ts';

describe('trackCost', () => {
  const prices: PriceBook = {
    'gpt-4o': {
      inputPerMTok: 2.5,
      outputPerMTok: 10.0,
      cachedInputPerMTok: 1.25,
    },
    'claude-sonnet': {
      inputPerMTok: 3.0,
      outputPerMTok: 15.0,
      cachedInputPerMTok: 0.3,
      thinkingPerMTok: 15.0,
    },
  };

  function emitCall(bus: ReturnType<typeof createEventBus>, runId: string, providerId: string) {
    bus.emit('provider.call', { runId, providerId, request: { messages: [] } });
  }

  test('calculates cost from input + output tokens', () => {
    const bus = createEventBus();
    const costs: Array<{ costUSD?: number }> = [];

    trackCost(bus, prices);
    bus.on('provider.usage', (e) => costs.push({ costUSD: e.costUSD }));

    emitCall(bus, 'r1', 'gpt-4o');
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });

    expect(costs).toHaveLength(1);
    // (1000/1e6)*2.5 + (500/1e6)*10 = 0.0025 + 0.005 = 0.0075
    expect(costs[0]?.costUSD).toBeCloseTo(0.0075, 6);
  });

  test('uses cachedInputPerMTok for cache read tokens', () => {
    const bus = createEventBus();
    const costs: Array<{ costUSD?: number }> = [];

    trackCost(bus, prices);
    bus.on('provider.usage', (e) => costs.push({ costUSD: e.costUSD }));

    emitCall(bus, 'r1', 'gpt-4o');
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        cachedInputTokens: 800,
      },
    });

    // regular input: (1000-800)/1e6*2.5 = 0.0005
    // cached input: 800/1e6*1.25 = 0.001
    // output: 500/1e6*10 = 0.005
    // total: 0.0065
    expect(costs[0]?.costUSD).toBeCloseTo(0.0065, 6);
  });

  test('uses thinkingPerMTok for reasoning tokens', () => {
    const bus = createEventBus();
    const costs: Array<{ costUSD?: number }> = [];

    trackCost(bus, prices);
    bus.on('provider.usage', (e) => costs.push({ costUSD: e.costUSD }));

    emitCall(bus, 'r1', 'claude-sonnet');
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 2000,
        reasoningTokens: 200,
      },
    });

    // input: 1000/1e6*3.0 = 0.003
    // output (non-thinking): (500-200)/1e6*15.0 = 0.0045
    // thinking: 200/1e6*15.0 = 0.003
    // total: 0.0105
    expect(costs[0]?.costUSD).toBeCloseTo(0.0105, 6);
  });

  test('unknown model leaves costUSD undefined', () => {
    const bus = createEventBus();
    const costs: Array<{ costUSD?: number }> = [];

    trackCost(bus, prices);
    bus.on('provider.usage', (e) => costs.push({ costUSD: e.costUSD }));

    emitCall(bus, 'r1', 'unknown-model');
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    expect(costs[0]?.costUSD).toBeUndefined();
  });

  test('no provider.call before usage — costUSD undefined', () => {
    const bus = createEventBus();
    const costs: Array<{ costUSD?: number }> = [];

    trackCost(bus, prices);
    bus.on('provider.usage', (e) => costs.push({ costUSD: e.costUSD }));

    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    expect(costs[0]?.costUSD).toBeUndefined();
  });

  test('unsubscribe stops tracking', () => {
    const bus = createEventBus();
    const costs: Array<{ costUSD?: number }> = [];

    const unsub = trackCost(bus, prices);
    bus.on('provider.usage', (e) => costs.push({ costUSD: e.costUSD }));

    unsub();

    emitCall(bus, 'r1', 'gpt-4o');
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    // trackCost unsubscribed, so costUSD should not be enriched
    expect(costs[0]?.costUSD).toBeUndefined();
  });

  test('handles undefined token counts gracefully', () => {
    const bus = createEventBus();
    const costs: Array<{ costUSD?: number }> = [];

    trackCost(bus, prices);
    bus.on('provider.usage', (e) => costs.push({ costUSD: e.costUSD }));

    emitCall(bus, 'r1', 'gpt-4o');
    bus.emit('provider.usage', {
      runId: 'r1',
      tokens: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
    });

    expect(costs[0]?.costUSD).toBeCloseTo(0, 6);
  });
});

describe('defaultPrices', () => {
  test('contains at least a few common models', () => {
    expect(Object.keys(defaultPrices).length).toBeGreaterThanOrEqual(3);
  });

  test('each entry has inputPerMTok and outputPerMTok', () => {
    for (const [, entry] of Object.entries(defaultPrices)) {
      expect(typeof entry.inputPerMTok).toBe('number');
      expect(typeof entry.outputPerMTok).toBe('number');
    }
  });
});
