import { describe, expect, it } from 'bun:test';
import { createPersistence } from './persistence.ts';

describe('createPersistence', () => {
  it('returns inMemory when ephemeral is true', async () => {
    const p = await createPersistence({ ephemeral: true });
    expect(p.store).toBeDefined();
    expect(p.checkpointer).toBeDefined();
    expect(p.type).toBe('memory');
    p.close();
  });

  it('returns sqlite when ephemeral is false and memory-sqlite is available', async () => {
    const p = await createPersistence({ ephemeral: false, dataDir: `/tmp/test-dr-${Date.now()}` });
    expect(p.store).toBeDefined();
    expect(p.checkpointer).toBeDefined();
    expect(p.type).toBe('sqlite');
    p.close();
  });

  it('store supports load and append', async () => {
    const p = await createPersistence({ ephemeral: true });
    const messages = await p.store.load('test-conv');
    expect(messages).toEqual([]);
    await p.store.append('test-conv', [{ role: 'user', content: 'hi' }]);
    const loaded = await p.store.load('test-conv');
    expect(loaded).toHaveLength(1);
    p.close();
  });

  it('checkpointer supports save and load', async () => {
    const p = await createPersistence({ ephemeral: true });
    await p.checkpointer.save('run-1', {
      runId: 'run-1',
      conversationId: 'c1',
      turn: 1,
      messages: [],
    } as Parameters<typeof p.checkpointer.save>[1]);
    const saved = await p.checkpointer.load('run-1');
    expect(saved).not.toBeNull();
    expect(saved?.runId).toBe('run-1');
    p.close();
  });
});
