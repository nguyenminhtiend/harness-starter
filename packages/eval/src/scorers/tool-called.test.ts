import { describe, expect, test } from 'bun:test';
import { toolCalled } from './tool-called.ts';

describe('toolCalled', () => {
  test('returns 1 when tool was called via toolCalls', async () => {
    const scorer = toolCalled('search');
    const result = await scorer({
      input: 'query',
      output: { toolCalls: [{ name: 'search', args: { q: 'test' } }] },
    });
    expect(result.score).toBe(1);
  });

  test('returns 0 when tool was not called', async () => {
    const scorer = toolCalled('search');
    const result = await scorer({
      input: 'query',
      output: { toolCalls: [{ name: 'fetch', args: {} }] },
    });
    expect(result.score).toBe(0);
  });

  test('finds tool in events array', async () => {
    const scorer = toolCalled('calculator');
    const result = await scorer({
      input: 'math',
      output: {
        events: [
          { type: 'turn-start' },
          { type: 'tool-start', name: 'calculator', args: { expr: '2+2' } },
          { type: 'tool-result', name: 'calculator' },
        ],
      },
    });
    expect(result.score).toBe(1);
  });

  test('checks expected args when provided', async () => {
    const scorer = toolCalled('search', { q: 'specific' });
    const result = await scorer({
      input: 'query',
      output: { toolCalls: [{ name: 'search', args: { q: 'specific' } }] },
    });
    expect(result.score).toBe(1);
  });

  test('returns 0 when args do not match', async () => {
    const scorer = toolCalled('search', { q: 'specific' });
    const result = await scorer({
      input: 'query',
      output: { toolCalls: [{ name: 'search', args: { q: 'different' } }] },
    });
    expect(result.score).toBe(0);
  });

  test('handles empty output', async () => {
    const scorer = toolCalled('search');
    const result = await scorer({ input: 'query', output: {} });
    expect(result.score).toBe(0);
  });
});
