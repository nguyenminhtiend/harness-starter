import { describe, expect, it } from 'bun:test';
import type { RunStore } from './run-store.ts';
import { createInMemoryRunStore } from './run-store.ts';

function makeStore(): RunStore {
  return createInMemoryRunStore();
}

const TS = '2026-04-24T00:00:00.000Z';

describe('InMemoryRunStore', () => {
  it('creates and retrieves a run', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS);

    const run = await store.get('r-1');
    expect(run).toEqual({
      id: 'r-1',
      capabilityId: 'simple-chat',
      status: 'pending',
      createdAt: TS,
      conversationId: undefined,
    });
  });

  it('stores optional conversationId', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS, 'conv-1');

    const run = await store.get('r-1');
    expect(run?.conversationId).toBe('conv-1');
  });

  it('returns undefined for non-existent run', async () => {
    const store = makeStore();
    expect(await store.get('nope')).toBeUndefined();
  });

  it('lists all runs when no filter', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS);
    await store.create('r-2', 'deep-research', TS);

    const runs = await store.list();
    expect(runs).toHaveLength(2);
  });

  it('filters by status', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS);
    await store.create('r-2', 'simple-chat', TS);
    await store.updateStatus('r-2', 'running');

    const runs = await store.list({ status: 'running' });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe('r-2');
  });

  it('filters by capabilityId', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS);
    await store.create('r-2', 'deep-research', TS);

    const runs = await store.list({ capabilityId: 'deep-research' });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe('r-2');
  });

  it('filters by conversationId', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS, 'conv-1');
    await store.create('r-2', 'simple-chat', TS, 'conv-2');

    const runs = await store.list({ conversationId: 'conv-1' });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe('r-1');
  });

  it('respects limit and offset', async () => {
    const store = makeStore();
    await store.create('r-1', 'a', TS);
    await store.create('r-2', 'a', TS);
    await store.create('r-3', 'a', TS);

    const page = await store.list({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
    expect(page[0]?.id).toBe('r-2');
    expect(page[1]?.id).toBe('r-3');
  });

  it('updates status and finishedAt', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS);
    const doneAt = '2026-04-24T01:00:00.000Z';
    await store.updateStatus('r-1', 'completed', doneAt);

    const run = await store.get('r-1');
    expect(run?.status).toBe('completed');
    expect(run?.finishedAt).toBe(doneAt);
  });

  it('updateStatus is a no-op for non-existent run', async () => {
    const store = makeStore();
    await store.updateStatus('nope', 'running');
  });

  it('deletes a run', async () => {
    const store = makeStore();
    await store.create('r-1', 'simple-chat', TS);
    await store.delete('r-1');

    expect(await store.get('r-1')).toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });

  it('delete is a no-op for non-existent run', async () => {
    const store = makeStore();
    await store.delete('nope');
  });
});
