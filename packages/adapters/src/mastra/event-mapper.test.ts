import { describe, expect, it } from 'bun:test';
import { mapMastraChunk } from './event-mapper.ts';

describe('mapMastraChunk (re-export from core)', () => {
  it('maps text-delta to text.delta', () => {
    const result = mapMastraChunk({
      type: 'text-delta',
      from: 'AGENT',
      payload: { text: 'hello' },
    });
    expect(result).toEqual({ type: 'text.delta', text: 'hello' });
  });

  it('maps unknown chunk types to artifact', () => {
    const result = mapMastraChunk({ type: 'whatever', from: 'AGENT', payload: { foo: 'bar' } });
    expect(result).toEqual({ type: 'artifact', name: 'whatever', data: { foo: 'bar' } });
  });
});
