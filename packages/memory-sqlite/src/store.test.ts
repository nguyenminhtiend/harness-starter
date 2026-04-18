import { afterEach, describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteStore } from './store.ts';

function tempDbPath(): string {
  return join(tmpdir(), `harness-store-test-${crypto.randomUUID()}.db`);
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const p of cleanupPaths) {
    try {
      unlinkSync(p);
      unlinkSync(`${p}-wal`);
      unlinkSync(`${p}-shm`);
    } catch {
      // ignore
    }
  }
  cleanupPaths.length = 0;
});

function makeStore() {
  const path = tempDbPath();
  cleanupPaths.push(path);
  return { store: sqliteStore({ path }), path };
}

describe('sqliteStore', () => {
  test('load returns empty array for unknown conversation', async () => {
    const { store } = makeStore();
    const messages = await store.load('unknown');
    expect(messages).toEqual([]);
  });

  test('append and load round-trips messages', async () => {
    const { store } = makeStore();
    await store.append('conv1', [{ role: 'user', content: 'Hello' }]);
    await store.append('conv1', [{ role: 'assistant', content: 'Hi' }]);

    const messages = await store.load('conv1');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('Hello');
    expect(messages[1]?.content).toBe('Hi');
  });

  test('conversations are isolated', async () => {
    const { store } = makeStore();
    await store.append('a', [{ role: 'user', content: 'A' }]);
    await store.append('b', [{ role: 'user', content: 'B' }]);

    expect(await store.load('a')).toHaveLength(1);
    expect(await store.load('b')).toHaveLength(1);
    expect((await store.load('a'))[0]?.content).toBe('A');
  });

  test('round-trips cacheBoundary on messages', async () => {
    const { store } = makeStore();
    await store.append('c1', [
      { role: 'system', content: 'You are helpful.', cacheBoundary: true },
      { role: 'user', content: 'Hi' },
    ]);

    const messages = await store.load('c1');
    expect(messages[0]?.cacheBoundary).toBe(true);
    expect(messages[1]?.cacheBoundary).toBeUndefined();
  });

  test('handles MessagePart[] content (tool-call, tool-result)', async () => {
    const { store } = makeStore();
    await store.append('c1', [
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'tc1', toolName: 'search', args: { q: 'test' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: 'tc1', toolName: 'search', result: ['a', 'b'] },
        ],
      },
    ]);

    const messages = await store.load('c1');
    expect(messages).toHaveLength(2);

    const assistantContent = messages[0]?.content;
    expect(Array.isArray(assistantContent)).toBe(true);
    if (Array.isArray(assistantContent)) {
      expect(assistantContent[0]?.type).toBe('tool-call');
      expect((assistantContent[0] as { args: unknown }).args).toEqual({ q: 'test' });
    }

    const toolContent = messages[1]?.content;
    expect(Array.isArray(toolContent)).toBe(true);
    if (Array.isArray(toolContent)) {
      expect((toolContent[0] as { result: unknown }).result).toEqual(['a', 'b']);
    }
  });

  test('persists across re-open', async () => {
    const path = tempDbPath();
    cleanupPaths.push(path);

    const store1 = sqliteStore({ path });
    await store1.append('c1', [{ role: 'user', content: 'persisted' }]);

    const store2 = sqliteStore({ path });
    const messages = await store2.load('c1');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('persisted');
  });

  test('append with multiple messages is atomic', async () => {
    const { store } = makeStore();
    await store.append('c1', [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ]);

    const messages = await store.load('c1');
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.content)).toEqual(['one', 'two', 'three']);
  });
});
