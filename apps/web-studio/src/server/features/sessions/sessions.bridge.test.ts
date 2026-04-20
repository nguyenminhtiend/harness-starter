import { describe, expect, it } from 'bun:test';
import { createEventBus, ToolError } from '@harness/core';
import { agentEventToUIEvents, bridgeBusToUIEvents } from './sessions.bridge.ts';

function acc() {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

describe('agentEventToUIEvents', () => {
  const sessionId = 'session-1';

  it('maps turn-start to agent phase', () => {
    const out = agentEventToUIEvents({ type: 'turn-start', turn: 2 }, sessionId, acc());
    expect(out).toEqual([
      { ts: expect.any(Number), runId: sessionId, type: 'agent', phase: 'turn-2' },
    ]);
  });

  it('maps tool-start', () => {
    const out = agentEventToUIEvents(
      { type: 'tool-start', id: 't1', name: 'fetch', args: { url: 'https://x' } },
      sessionId,
      acc(),
    );
    expect(out[0]?.type).toBe('tool');
    if (out[0]?.type === 'tool') {
      expect(out[0].toolName).toBe('fetch');
      expect(out[0].args).toEqual({ url: 'https://x' });
    }
  });

  it('maps tool-result with duration', () => {
    const out = agentEventToUIEvents(
      { type: 'tool-result', id: 't1', result: { ok: true }, durationMs: 12 },
      sessionId,
      acc(),
    );
    expect(out[0]?.type).toBe('tool');
    if (out[0]?.type === 'tool') {
      expect(out[0].toolName).toBe('');
      expect(out[0].result).toBe('[object Object]');
      expect(out[0].durationMs).toBe(12);
    }
  });

  it('maps tool-error', () => {
    const err = new ToolError('boom', { toolName: 'fetch' });
    const out = agentEventToUIEvents(
      { type: 'tool-error', id: 't1', error: err },
      sessionId,
      acc(),
    );
    expect(out[0]?.type).toBe('tool');
    if (out[0]?.type === 'tool') {
      expect(out[0].isError).toBe(true);
      expect(out[0].result).toBe('boom');
    }
  });

  it('accumulates usage into metric events', () => {
    const usageAcc = acc();
    const first = agentEventToUIEvents(
      { type: 'usage', tokens: { inputTokens: 3, outputTokens: 4 } },
      sessionId,
      usageAcc,
    );
    const second = agentEventToUIEvents(
      { type: 'usage', tokens: { inputTokens: 1, outputTokens: 0 } },
      sessionId,
      usageAcc,
    );
    expect(first[0]?.type).toBe('metric');
    if (first[0]?.type === 'metric') {
      expect(first[0].inputTokens).toBe(3);
      expect(first[0].outputTokens).toBe(4);
    }
    if (second[0]?.type === 'metric') {
      expect(second[0].inputTokens).toBe(4);
      expect(second[0].outputTokens).toBe(4);
    }
  });

  it('maps text-delta to writer', () => {
    const out = agentEventToUIEvents({ type: 'text-delta', delta: 'hi' }, sessionId, acc());
    expect(out).toEqual([
      { ts: expect.any(Number), runId: sessionId, type: 'writer', delta: 'hi' },
    ]);
  });

  it('maps handoff to agent phase with message', () => {
    const out = agentEventToUIEvents({ type: 'handoff', from: 'a', to: 'b' }, sessionId, acc());
    expect(out).toEqual([
      { ts: expect.any(Number), runId: sessionId, type: 'agent', phase: 'b', message: 'a → b' },
    ]);
  });

  it('suppresses checkpoint events from UI', () => {
    const out = agentEventToUIEvents(
      { type: 'checkpoint', runId: sessionId, turn: 1 },
      sessionId,
      acc(),
    );
    expect(out).toEqual([]);
  });

  it('maps budget.exceeded to error', () => {
    const out = agentEventToUIEvents(
      { type: 'budget.exceeded', kind: 'tokens', spent: 10, limit: 5 },
      sessionId,
      acc(),
    );
    expect(out[0]?.type).toBe('error');
    if (out[0]?.type === 'error') {
      expect(out[0].code).toBe('BUDGET_EXCEEDED');
      expect(out[0].message).toContain('tokens');
    }
  });

  it('maps abort to error', () => {
    const out = agentEventToUIEvents({ type: 'abort' }, sessionId, acc());
    expect(out[0]?.type).toBe('error');
    if (out[0]?.type === 'error') {
      expect(out[0].code).toBe('ABORTED');
    }
  });

  it('returns empty for unmapped stream events', () => {
    const out = agentEventToUIEvents({ type: 'finish', reason: 'stop' }, sessionId, acc());
    expect(out).toEqual([]);
  });
});

describe('bridgeBusToUIEvents', () => {
  const sessionId = 'session-bus';

  it('forwards handoff, tool.start, tool.finish, and provider.usage for matching runId', () => {
    const bus = createEventBus();
    const collected: { type: string }[] = [];
    const usageAcc = acc();
    const unsub = bridgeBusToUIEvents(bus, sessionId, usageAcc, (ev) => {
      collected.push({ type: ev.type });
    });

    bus.emit('handoff', { runId: sessionId, from: 'plan', to: 'research' });
    bus.emit('handoff', { runId: 'other', from: 'x', to: 'y' });
    bus.emit('tool.start', { runId: sessionId, toolName: 'fetch', args: {} });
    bus.emit('tool.finish', { runId: sessionId, toolName: 'fetch', result: 'ok', durationMs: 9 });
    bus.emit('provider.usage', {
      runId: sessionId,
      tokens: { inputTokens: 2, outputTokens: 3 },
      costUSD: 0.01,
    });

    unsub();

    expect(collected.map((c) => c.type)).toEqual(['agent', 'tool', 'tool', 'metric']);
    expect(usageAcc.inputTokens).toBe(2);
    expect(usageAcc.outputTokens).toBe(3);
    expect(usageAcc.costUsd).toBe(0.01);
  });

  it('unsubscribe stops further events', () => {
    const bus = createEventBus();
    const collected: string[] = [];
    const unsub = bridgeBusToUIEvents(bus, sessionId, acc(), (ev) => {
      collected.push(ev.type);
    });
    unsub();
    bus.emit('handoff', { runId: sessionId, from: 'a', to: 'b' });
    expect(collected).toEqual([]);
  });
});
