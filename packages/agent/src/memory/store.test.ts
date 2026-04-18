import { describe, expect, test } from 'bun:test';
import { inMemoryStore } from './store.ts';

describe('inMemoryStore', () => {
  test('load returns empty array for unknown conversation', async () => {
    const store = inMemoryStore();
    const messages = await store.load('unknown');
    expect(messages).toEqual([]);
  });

  test('append and load round-trips messages', async () => {
    const store = inMemoryStore();
    await store.append('conv1', [{ role: 'user', content: 'Hello' }]);
    await store.append('conv1', [{ role: 'assistant', content: 'Hi' }]);

    const messages = await store.load('conv1');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('Hello');
    expect(messages[1]?.content).toBe('Hi');
  });

  test('conversations are isolated', async () => {
    const store = inMemoryStore();
    await store.append('a', [{ role: 'user', content: 'A' }]);
    await store.append('b', [{ role: 'user', content: 'B' }]);

    expect(await store.load('a')).toHaveLength(1);
    expect(await store.load('b')).toHaveLength(1);
    expect((await store.load('a'))[0]?.content).toBe('A');
  });
});
