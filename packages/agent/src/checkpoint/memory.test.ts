import { describe, expect, test } from 'bun:test';
import { inMemoryCheckpointer } from './memory.ts';

describe('inMemoryCheckpointer', () => {
  test('save and load round-trips state', async () => {
    const cp = inMemoryCheckpointer();
    const state = {
      runId: 'r1',
      conversationId: 'c1',
      turn: 3,
      messages: [{ role: 'user' as const, content: 'hi' }],
    };

    await cp.save('r1', state);
    const loaded = await cp.load('r1');
    expect(loaded).toEqual(state);
  });

  test('load returns null for unknown runId', async () => {
    const cp = inMemoryCheckpointer();
    expect(await cp.load('unknown')).toBeNull();
  });

  test('list returns checkpoint refs by conversation', async () => {
    const cp = inMemoryCheckpointer();
    await cp.save('r1', { runId: 'r1', conversationId: 'c1', turn: 1, messages: [] });
    await cp.save('r2', { runId: 'r2', conversationId: 'c1', turn: 2, messages: [] });
    await cp.save('r3', { runId: 'r3', conversationId: 'c2', turn: 1, messages: [] });

    const refs = await cp.list('c1');
    expect(refs).toHaveLength(2);
    expect(refs[0]?.runId).toBe('r1');
    expect(refs[1]?.runId).toBe('r2');
  });

  test('save is deep-cloned (mutations do not affect stored state)', async () => {
    const cp = inMemoryCheckpointer();
    const messages = [{ role: 'user' as const, content: 'original' }];
    await cp.save('r1', { runId: 'r1', conversationId: 'c1', turn: 1, messages });

    const first = messages[0];
    if (first) {
      first.content = 'mutated';
    }
    const loaded = await cp.load('r1');
    expect(loaded?.messages[0]?.content).toBe('original');
  });
});
