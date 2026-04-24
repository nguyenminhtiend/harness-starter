import { describe, expect, it } from 'bun:test';
import { mapMastraChunk } from './event-mapper.ts';

describe('mapMastraChunk', () => {
  it('maps text-delta from Mastra fullStream', () => {
    const result = mapMastraChunk({
      type: 'text-delta',
      from: 'AGENT',
      payload: { text: 'hello' },
    });
    expect(result).toEqual({ type: 'text-delta', text: 'hello' });
  });

  it('maps reasoning-delta', () => {
    const result = mapMastraChunk({
      type: 'reasoning',
      from: 'AGENT',
      payload: { text: 'thinking...' },
    });
    expect(result).toEqual({ type: 'reasoning-delta', text: 'thinking...' });
  });

  it('maps tool-call from fullStream payload', () => {
    const result = mapMastraChunk({
      type: 'tool-call',
      from: 'AGENT',
      payload: { toolCallId: 'c-1', toolName: 'calculator', args: { expression: '2+3' } },
    });
    expect(result).toEqual({
      type: 'tool-called',
      tool: 'calculator',
      args: { expression: '2+3' },
      callId: 'c-1',
    });
  });

  it('maps tool-call without args gracefully', () => {
    const result = mapMastraChunk({
      type: 'tool-call',
      from: 'AGENT',
      payload: { toolCallId: 'c-1', toolName: 'calculator' },
    });
    expect(result).toEqual({
      type: 'tool-called',
      tool: 'calculator',
      args: null,
      callId: 'c-1',
    });
  });

  it('maps tool-result', () => {
    const result = mapMastraChunk({
      type: 'tool-result',
      from: 'AGENT',
      payload: { toolCallId: 'c-1', result: '5' },
    });
    expect(result).toEqual({
      type: 'tool-result',
      callId: 'c-1',
      result: '5',
    });
  });

  it('maps step-finish with usage from output', () => {
    const result = mapMastraChunk({
      type: 'step-finish',
      from: 'AGENT',
      payload: {
        output: {
          text: '',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        },
      },
    });
    expect(result).toEqual({
      type: 'step-finished',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
  });

  it('maps step-finish without usage', () => {
    const result = mapMastraChunk({
      type: 'step-finish',
      from: 'AGENT',
      payload: { output: {} },
    });
    expect(result).toEqual({ type: 'step-finished' });
  });

  it('maps finish with usage', () => {
    const result = mapMastraChunk({
      type: 'finish',
      from: 'AGENT',
      payload: {
        output: {
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        },
      },
    });
    expect(result).toEqual({
      type: 'usage',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  });

  it('returns undefined for finish without usage', () => {
    const result = mapMastraChunk({ type: 'finish', from: 'AGENT', payload: { output: {} } });
    expect(result).toBeUndefined();
  });

  it('returns undefined for start/step-start/tool-error', () => {
    expect(mapMastraChunk({ type: 'start', from: 'AGENT' })).toBeUndefined();
    expect(mapMastraChunk({ type: 'step-start', from: 'AGENT' })).toBeUndefined();
    expect(mapMastraChunk({ type: 'tool-error', from: 'AGENT' })).toBeUndefined();
  });

  it('maps unknown chunk types to custom', () => {
    const result = mapMastraChunk({ type: 'whatever', from: 'AGENT', payload: { foo: 'bar' } });
    expect(result).toEqual({ type: 'custom', kind: 'whatever', data: { foo: 'bar' } });
  });
});
