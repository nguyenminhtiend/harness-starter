import { describe, expect, it } from 'bun:test';
import { type AccUsage, mastraChunkToUIEvents } from './mastra-events.ts';

function makeAccUsage(): AccUsage {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

describe('mastraChunkToUIEvents', () => {
  const runId = 'test-run';

  it('translates text-delta to writer event', () => {
    const chunk = { type: 'text-delta' as const, payload: { id: 't1', text: 'Hello' } };
    const events = mastraChunkToUIEvents(chunk, runId, makeAccUsage());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('writer');
    if (events[0].type === 'writer') {
      expect(events[0].delta).toBe('Hello');
    }
  });

  it('translates tool-call to tool + llm events', () => {
    const chunk = {
      type: 'tool-call' as const,
      payload: {
        toolCallId: 'call-1',
        toolName: 'calculator',
        args: { expression: '2+3' },
      },
    };
    const events = mastraChunkToUIEvents(chunk, runId, makeAccUsage());
    const types = events.map((e) => e.type);
    expect(types).toContain('tool');
    expect(types).toContain('llm');

    const toolEv = events.find((e) => e.type === 'tool');
    if (toolEv?.type === 'tool') {
      expect(toolEv.toolName).toBe('calculator');
      expect(toolEv.callId).toBe('call-1');
      expect(toolEv.args).toEqual({ expression: '2+3' });
    }
  });

  it('translates tool-result to tool event with result', () => {
    const chunk = {
      type: 'tool-result' as const,
      payload: {
        toolCallId: 'call-1',
        toolName: 'calculator',
        result: { result: 5, expression: '2+3' },
      },
    };
    const events = mastraChunkToUIEvents(chunk, runId, makeAccUsage());
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.type === 'tool') {
      expect(ev.toolName).toBe('calculator');
      expect(ev.callId).toBe('call-1');
      expect(ev.result).toBeDefined();
    }
  });

  it('translates tool-error to tool event with isError', () => {
    const chunk = {
      type: 'tool-error' as const,
      payload: {
        toolCallId: 'call-2',
        toolName: 'calculator',
        error: 'Invalid expression',
      },
    };
    const events = mastraChunkToUIEvents(chunk, runId, makeAccUsage());
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.type === 'tool') {
      expect(ev.isError).toBe(true);
      expect(ev.toolName).toBe('calculator');
    }
  });

  it('translates step-finish and accumulates usage', () => {
    const acc = makeAccUsage();
    const chunk = {
      type: 'step-finish' as const,
      payload: {
        totalUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    };
    const events = mastraChunkToUIEvents(chunk, runId, acc);
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.type === 'metric') {
      expect(ev.inputTokens).toBe(100);
      expect(ev.outputTokens).toBe(50);
    }
    expect(acc.inputTokens).toBe(100);
    expect(acc.outputTokens).toBe(50);
  });

  it('translates reasoning-delta to llm thinking event', () => {
    const chunk = {
      type: 'reasoning-delta' as const,
      payload: { id: 'r1', text: 'Let me think...' },
    };
    const events = mastraChunkToUIEvents(chunk, runId, makeAccUsage());
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.type === 'llm') {
      expect(ev.phase).toBe('thinking');
      expect(ev.text).toBe('Let me think...');
    }
  });

  it('returns empty array for unhandled chunk types', () => {
    const chunk = { type: 'response-metadata' as const, payload: {} };
    const events = mastraChunkToUIEvents(chunk, runId, makeAccUsage());
    expect(events).toHaveLength(0);
  });
});
