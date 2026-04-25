import { describe, expect, it } from 'bun:test';
import type { PendingApproval } from '../../domain/approval.ts';
import type { ApprovalStore } from './approval-store.ts';
import { createInMemoryApprovalStore } from './approval-store.ts';

function makeStore(): ApprovalStore {
  return createInMemoryApprovalStore();
}

function makePending(id: string, runId: string): PendingApproval {
  return {
    id,
    runId,
    payload: { plan: 'test plan' },
    status: 'pending',
    createdAt: '2026-04-24T00:00:00.000Z',
  };
}

describe('InMemoryApprovalStore', () => {
  it('creates and retrieves a pending approval', async () => {
    const store = makeStore();
    const approval = makePending('a-1', 'r-1');
    await store.createPending(approval);

    const stored = await store.get('a-1');
    expect(stored).toEqual(approval);
  });

  it('returns undefined for non-existent approval', async () => {
    const store = makeStore();
    expect(await store.get('nope')).toBeUndefined();
  });

  it('resolves a pending approval with approve decision', async () => {
    const store = makeStore();
    await store.createPending(makePending('a-1', 'r-1'));

    const resolvedAt = '2026-04-24T01:00:00.000Z';
    await store.resolve('a-1', { kind: 'approve' }, resolvedAt);

    const stored = await store.get('a-1');
    expect(stored?.status).toBe('resolved');
    expect(stored?.decision).toEqual({ kind: 'approve' });
    expect(stored?.resolvedAt).toBe(resolvedAt);
  });

  it('resolves a pending approval with reject decision', async () => {
    const store = makeStore();
    await store.createPending(makePending('a-1', 'r-1'));

    await store.resolve('a-1', { kind: 'reject', reason: 'bad plan' }, '2026-04-24T01:00:00.000Z');

    const stored = await store.get('a-1');
    expect(stored?.status).toBe('resolved');
    expect(stored?.decision).toEqual({ kind: 'reject', reason: 'bad plan' });
  });

  it('lists pending approvals for a run', async () => {
    const store = makeStore();
    await store.createPending(makePending('a-1', 'r-1'));
    await store.createPending(makePending('a-2', 'r-1'));
    await store.createPending(makePending('a-3', 'r-2'));

    const pending = await store.listPending('r-1');
    expect(pending).toHaveLength(2);
    expect(pending.map((a) => a.id).sort()).toEqual(['a-1', 'a-2']);
  });

  it('resolved approvals are excluded from listPending', async () => {
    const store = makeStore();
    await store.createPending(makePending('a-1', 'r-1'));
    await store.resolve('a-1', { kind: 'approve' }, '2026-04-24T01:00:00.000Z');

    const pending = await store.listPending('r-1');
    expect(pending).toHaveLength(0);
  });

  it('returns empty array for run with no pending approvals', async () => {
    const store = makeStore();
    expect(await store.listPending('nope')).toEqual([]);
  });
});
