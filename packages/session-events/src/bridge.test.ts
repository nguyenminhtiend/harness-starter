import { describe, expect, it } from 'bun:test';
import { createEventBus, ToolError } from '@harness/core';
import { agentEventToUIEvents, bridgeBusToUIEvents } from './bridge.ts';

function acc() {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function names() {
  return new Map<string, string>();
}

describe('agentEventToUIEvents', () => {
  const runId = 'session-1';

  it('maps turn-start to agent phase', () => {
    const out = agentEventToUIEvents({ type: 'turn-start', turn: 2 }, runId, acc(), names());
    expect(out).toEqual([{ ts: expect.any(Number), runId, type: 'agent', phase: 'turn-2' }]);
  });

  it('maps tool-start with callId', () => {
    const toolNames = new Map<string, string>();
    const out = agentEventToUIEvents(
      { type: 'tool-start', id: 't1', name: 'fetch', args: { url: 'https://x' } },
      runId,
      acc(),
      toolNames,
    );
    expect(out[0]?.type).toBe('tool');
    if (out[0]?.type === 'tool') {
      expect(out[0].toolName).toBe('fetch');
      expect(out[0].callId).toBe('t1');
      expect(out[0].args).toEqual({ url: 'https://x' });
    }
    expect(toolNames.get('t1')).toBe('fetch');
  });

  it('maps tool-result with duration, resolves toolName, and JSON-stringifies objects', () => {
    const toolNames = new Map<string, string>([['t1', 'fetch']]);
    const out = agentEventToUIEvents(
      { type: 'tool-result', id: 't1', result: { ok: true }, durationMs: 12 },
      runId,
      acc(),
      toolNames,
    );
    expect(out[0]?.type).toBe('tool');
    if (out[0]?.type === 'tool') {
      expect(out[0].toolName).toBe('fetch');
      expect(out[0].callId).toBe('t1');
      expect(JSON.parse(out[0].result ?? '')).toEqual({ ok: true });
      expect(out[0].durationMs).toBe(12);
    }
    expect(toolNames.has('t1')).toBe(false);
  });

  it('keeps string tool-result as-is without JSON-wrapping', () => {
    const toolNames = new Map<string, string>([['t1', 'fetch']]);
    const out = agentEventToUIEvents(
      { type: 'tool-result', id: 't1', result: 'raw text', durationMs: 1 },
      runId,
      acc(),
      toolNames,
    );
    if (out[0]?.type === 'tool') {
      expect(out[0].result).toBe('raw text');
    }
  });

  it('maps tool-error and resolves toolName', () => {
    const toolNames = new Map<string, string>([['t1', 'fetch']]);
    const err = new ToolError('boom', { toolName: 'fetch' });
    const out = agentEventToUIEvents(
      { type: 'tool-error', id: 't1', error: err },
      runId,
      acc(),
      toolNames,
    );
    expect(out[0]?.type).toBe('tool');
    if (out[0]?.type === 'tool') {
      expect(out[0].isError).toBe(true);
      expect(out[0].result).toBe('boom');
      expect(out[0].toolName).toBe('fetch');
    }
    expect(toolNames.has('t1')).toBe(false);
  });

  it('maps provider tool-call stream event to llm tool-call', () => {
    const out = agentEventToUIEvents(
      { type: 'tool-call', id: 'c1', name: 'search', args: { q: 'x' } },
      runId,
      acc(),
      names(),
    );
    expect(out[0]?.type).toBe('llm');
    if (out[0]?.type === 'llm') {
      expect(out[0].phase).toBe('tool-call');
      expect(out[0].toolName).toBe('search');
      expect(out[0].callId).toBe('c1');
      expect(out[0].args).toEqual({ q: 'x' });
    }
  });

  it('accumulates usage into metric events', () => {
    const usageAcc = acc();
    const tn = names();
    const first = agentEventToUIEvents(
      { type: 'usage', tokens: { inputTokens: 3, outputTokens: 4 } },
      runId,
      usageAcc,
      tn,
    );
    const second = agentEventToUIEvents(
      { type: 'usage', tokens: { inputTokens: 1, outputTokens: 0 } },
      runId,
      usageAcc,
      tn,
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
    const out = agentEventToUIEvents({ type: 'text-delta', delta: 'hi' }, runId, acc(), names());
    expect(out).toEqual([{ ts: expect.any(Number), runId, type: 'writer', delta: 'hi' }]);
  });

  it('maps thinking-delta to llm thinking', () => {
    const out = agentEventToUIEvents(
      { type: 'thinking-delta', delta: 'hmm' },
      runId,
      acc(),
      names(),
    );
    expect(out[0]?.type).toBe('llm');
    if (out[0]?.type === 'llm') {
      expect(out[0].phase).toBe('thinking');
      expect(out[0].text).toBe('hmm');
    }
  });

  it('maps handoff to node start with from/to', () => {
    const out = agentEventToUIEvents(
      { type: 'handoff', from: 'a', to: 'b' },
      runId,
      acc(),
      names(),
    );
    expect(out[0]?.type).toBe('node');
    if (out[0]?.type === 'node') {
      expect(out[0].phase).toBe('start');
      expect(out[0].node).toBe('b');
      expect(out[0].from).toBe('a');
    }
  });

  it('suppresses checkpoint events from UI', () => {
    const out = agentEventToUIEvents({ type: 'checkpoint', runId, turn: 1 }, runId, acc(), names());
    expect(out).toEqual([]);
  });

  it('maps budget.exceeded to error', () => {
    const out = agentEventToUIEvents(
      { type: 'budget.exceeded', kind: 'tokens', spent: 10, limit: 5 },
      runId,
      acc(),
      names(),
    );
    expect(out[0]?.type).toBe('error');
    if (out[0]?.type === 'error') {
      expect(out[0].code).toBe('BUDGET_EXCEEDED');
      expect(out[0].message).toContain('tokens');
    }
  });

  it('maps abort to error', () => {
    const out = agentEventToUIEvents({ type: 'abort' }, runId, acc(), names());
    expect(out[0]?.type).toBe('error');
    if (out[0]?.type === 'error') {
      expect(out[0].code).toBe('ABORTED');
    }
  });

  it('returns empty for unmapped stream events', () => {
    const out = agentEventToUIEvents({ type: 'finish', reason: 'stop' }, runId, acc(), names());
    expect(out).toEqual([]);
  });
});

describe('bridgeBusToUIEvents', () => {
  const runId = 'session-bus';

  it('forwards provider.call, handoff, tool.start, tool.finish, and provider.usage', () => {
    const bus = createEventBus();
    const collected: UIEventSummary[] = [];
    const usageAcc = acc();
    const unsub = bridgeBusToUIEvents(bus, runId, usageAcc, (ev) => {
      collected.push({ type: ev.type, phase: 'phase' in ev ? ev.phase : undefined });
    });

    bus.emit('provider.call', {
      runId,
      providerId: 'openai',
      request: {
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
        ],
      },
    });
    bus.emit('handoff', { runId, from: 'plan', to: 'research' });
    bus.emit('handoff', { runId: 'other', from: 'x', to: 'y' });
    bus.emit('tool.start', { runId, toolName: 'fetch', args: {} });
    bus.emit('tool.finish', { runId, toolName: 'fetch', result: 'ok', durationMs: 9 });
    bus.emit('provider.usage', {
      runId,
      tokens: { inputTokens: 2, outputTokens: 3 },
      costUSD: 0.01,
    });

    unsub();

    expect(collected.map((c) => c.type)).toEqual(['llm', 'node', 'tool', 'tool', 'metric']);
    expect(collected[0]?.phase).toBe('request');
    expect(collected[1]?.phase).toBe('start');
    expect(usageAcc.inputTokens).toBe(2);
    expect(usageAcc.outputTokens).toBe(3);
    expect(usageAcc.costUsd).toBe(0.01);
  });

  it('provider.call includes messages array', () => {
    const bus = createEventBus();
    let captured: UIEventCapture | undefined;
    bridgeBusToUIEvents(bus, runId, acc(), (ev) => {
      if (ev.type === 'llm' && ev.phase === 'request') {
        captured = { messages: ev.messages, providerId: ev.providerId };
      }
    });

    bus.emit('provider.call', {
      runId,
      providerId: 'anthropic',
      request: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(captured?.providerId).toBe('anthropic');
    expect(captured?.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('unsubscribe stops further events', () => {
    const bus = createEventBus();
    const collected: string[] = [];
    const unsub = bridgeBusToUIEvents(bus, runId, acc(), (ev) => {
      collected.push(ev.type);
    });
    unsub();
    bus.emit('handoff', { runId, from: 'a', to: 'b' });
    expect(collected).toEqual([]);
  });
});

interface UIEventSummary {
  type: string;
  phase?: string;
}

interface UIEventCapture {
  messages?: unknown;
  providerId?: string;
}
