import { afterEach, describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteCheckpointer } from './checkpointer.ts';

function tempDbPath(): string {
  return join(tmpdir(), `harness-cp-test-${crypto.randomUUID()}.db`);
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

function makeCp() {
  const path = tempDbPath();
  cleanupPaths.push(path);
  return { cp: sqliteCheckpointer({ path }), path };
}

describe('sqliteCheckpointer', () => {
  test('save and load round-trips state', async () => {
    const { cp } = makeCp();
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
    const { cp } = makeCp();
    expect(await cp.load('unknown')).toBeNull();
  });

  test('list returns checkpoint refs by conversation', async () => {
    const { cp } = makeCp();
    await cp.save('r1', { runId: 'r1', conversationId: 'c1', turn: 1, messages: [] });
    await cp.save('r2', { runId: 'r2', conversationId: 'c1', turn: 2, messages: [] });
    await cp.save('r3', { runId: 'r3', conversationId: 'c2', turn: 1, messages: [] });

    const refs = await cp.list('c1');
    expect(refs).toHaveLength(2);
    expect(refs[0]?.runId).toBe('r1');
    expect(refs[1]?.runId).toBe('r2');
  });

  test('mutations after save do not affect stored state', async () => {
    const { cp } = makeCp();
    const messages = [{ role: 'user' as const, content: 'original' }];
    await cp.save('r1', { runId: 'r1', conversationId: 'c1', turn: 1, messages });

    const first = messages[0];
    if (first) {
      first.content = 'mutated';
    }
    const loaded = await cp.load('r1');
    expect(loaded?.messages[0]?.content).toBe('original');
  });

  test('save with same runId upserts', async () => {
    const { cp } = makeCp();
    await cp.save('r1', { runId: 'r1', conversationId: 'c1', turn: 1, messages: [] });
    await cp.save('r1', {
      runId: 'r1',
      conversationId: 'c1',
      turn: 5,
      messages: [{ role: 'user', content: 'updated' }],
    });

    const loaded = await cp.load('r1');
    expect(loaded?.turn).toBe(5);
    expect(loaded?.messages).toHaveLength(1);

    const refs = await cp.list('c1');
    expect(refs).toHaveLength(1);
  });

  test('persists across re-open', async () => {
    const path = tempDbPath();
    cleanupPaths.push(path);

    const cp1 = sqliteCheckpointer({ path });
    await cp1.save('r1', { runId: 'r1', conversationId: 'c1', turn: 2, messages: [] });

    const cp2 = sqliteCheckpointer({ path });
    const loaded = await cp2.load('r1');
    expect(loaded?.turn).toBe(2);
  });

  test('round-trips pendingApprovals and graphState', async () => {
    const { cp } = makeCp();
    const state = {
      runId: 'r1',
      conversationId: 'c1',
      turn: 1,
      messages: [],
      pendingApprovals: [{ approvalId: 'a1', toolName: 'deploy', args: { env: 'prod' } }],
      graphState: { currentNode: 'review', visited: ['start', 'review'] },
    };

    await cp.save('r1', state);
    const loaded = await cp.load('r1');
    expect(loaded?.pendingApprovals).toEqual(state.pendingApprovals);
    expect(loaded?.graphState).toEqual(state.graphState);
  });

  test('list returns refs ordered by createdAt', async () => {
    const { cp } = makeCp();
    await cp.save('r1', { runId: 'r1', conversationId: 'c1', turn: 1, messages: [] });
    await cp.save('r2', { runId: 'r2', conversationId: 'c1', turn: 2, messages: [] });
    await cp.save('r3', { runId: 'r3', conversationId: 'c1', turn: 3, messages: [] });

    const refs = await cp.list('c1');
    for (let i = 1; i < refs.length; i++) {
      const prev = refs[i - 1];
      const curr = refs[i];
      if (prev && curr) {
        expect(prev.createdAt <= curr.createdAt).toBe(true);
      }
    }
  });
});
