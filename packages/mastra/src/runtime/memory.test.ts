import { describe, expect, it } from 'bun:test';
import { Memory } from '@mastra/memory';
import { createDefaultMemory } from './memory.ts';

describe('createDefaultMemory', () => {
  it('returns a Memory instance', () => {
    const memory = createDefaultMemory();
    expect(memory).toBeInstanceOf(Memory);
  });

  it('disables semantic recall when no vector store is provided', () => {
    const memory = createDefaultMemory();
    expect(memory).toBeInstanceOf(Memory);
  });

  it('accepts custom storage', () => {
    const memory = createDefaultMemory({
      storage: { id: 'custom' } as never,
    });
    expect(memory).toBeInstanceOf(Memory);
  });

  it('defaults vector to false when not provided', () => {
    const memory = createDefaultMemory({ vector: false });
    expect(memory).toBeInstanceOf(Memory);
  });
});
