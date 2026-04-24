import { describe, expect, it } from 'bun:test';
import { mapStreamChunk } from './event-mapper.ts';

describe('mapStreamChunk', () => {
  it('maps text-delta to text.delta', () => {
    const result = mapStreamChunk({
      type: 'text-delta',
      from: 'AGENT',
      payload: { text: 'hello' },
    });
    expect(result).toEqual({ type: 'text.delta', text: 'hello' });
  });

  it('maps reasoning to reasoning.delta', () => {
    const result = mapStreamChunk({
      type: 'reasoning',
      from: 'AGENT',
      payload: { text: 'thinking...' },
    });
    expect(result).toEqual({ type: 'reasoning.delta', text: 'thinking...' });
  });

  it('maps tool-call to tool.called', () => {
    const result = mapStreamChunk({
      type: 'tool-call',
      from: 'AGENT',
      payload: { toolCallId: 'c-1', toolName: 'calculator', args: { expression: '2+3' } },
    });
    expect(result).toEqual({
      type: 'tool.called',
      tool: 'calculator',
      args: { expression: '2+3' },
      callId: 'c-1',
    });
  });

  it('maps tool-call without args gracefully', () => {
    const result = mapStreamChunk({
      type: 'tool-call',
      from: 'AGENT',
      payload: { toolCallId: 'c-1', toolName: 'calculator' },
    });
    expect(result).toEqual({
      type: 'tool.called',
      tool: 'calculator',
      args: null,
      callId: 'c-1',
    });
  });

  it('maps tool-result to tool.result', () => {
    const result = mapStreamChunk({
      type: 'tool-result',
      from: 'AGENT',
      payload: { toolCallId: 'c-1', result: '5' },
    });
    expect(result).toEqual({
      type: 'tool.result',
      callId: 'c-1',
      result: '5',
    });
  });

  it('maps step-finish to step.finished with usage', () => {
    const result = mapStreamChunk({
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
      type: 'step.finished',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
  });

  it('maps step-finish without usage', () => {
    const result = mapStreamChunk({
      type: 'step-finish',
      from: 'AGENT',
      payload: { output: {} },
    });
    expect(result).toEqual({ type: 'step.finished' });
  });

  it('maps finish with usage to usage event', () => {
    const result = mapStreamChunk({
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
    const result = mapStreamChunk({ type: 'finish', from: 'AGENT', payload: { output: {} } });
    expect(result).toBeUndefined();
  });

  it('returns undefined for start/step-start/tool-error', () => {
    expect(mapStreamChunk({ type: 'start', from: 'AGENT' })).toBeUndefined();
    expect(mapStreamChunk({ type: 'step-start', from: 'AGENT' })).toBeUndefined();
    expect(mapStreamChunk({ type: 'tool-error', from: 'AGENT' })).toBeUndefined();
  });

  it('maps unknown chunk types to artifact', () => {
    const result = mapStreamChunk({ type: 'whatever', from: 'AGENT', payload: { foo: 'bar' } });
    expect(result).toEqual({ type: 'artifact', name: 'whatever', data: { foo: 'bar' } });
  });

  it('computes totalTokens from partial usage', () => {
    const result = mapStreamChunk({
      type: 'step-finish',
      from: 'AGENT',
      payload: {
        output: { usage: { inputTokens: 10, outputTokens: 20 } },
      },
    });
    expect(result).toEqual({
      type: 'step.finished',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
  });
});
