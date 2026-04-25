import { describe, expect, it } from 'bun:test';
import type { ApprovalDecision } from '../../domain/approval.ts';
import { createInMemoryApprovalQueue } from './approval-queue.ts';
import { createInMemoryApprovalStore } from './approval-store.ts';

describe('InMemoryApprovalQueue', () => {
  it('request() resolves when resolve() is called after', async () => {
    const store = createInMemoryApprovalStore();
    const queue = createInMemoryApprovalQueue(store);

    const requestPromise = queue.request(
      'a-1',
      'r-1',
      { plan: 'test' },
      '2026-04-24T00:00:00.000Z',
    );

    const decision: ApprovalDecision = { kind: 'approve' };
    await queue.resolve('a-1', decision, '2026-04-24T01:00:00.000Z');

    const result = await requestPromise;
    expect(result).toEqual(decision);
  });

  it('resolve() before request() — request returns immediately', async () => {
    const store = createInMemoryApprovalStore();
    const queue = createInMemoryApprovalQueue(store);

    await store.createPending({
      id: 'a-1',
      runId: 'r-1',
      payload: { plan: 'test' },
      status: 'pending',
      createdAt: '2026-04-24T00:00:00.000Z',
    });

    const decision: ApprovalDecision = { kind: 'reject', reason: 'bad' };
    await queue.resolve('a-1', decision, '2026-04-24T01:00:00.000Z');

    const resolved = await store.get('a-1');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.decision).toEqual(decision);
  });

  it('request() persists pending approval to store', async () => {
    const store = createInMemoryApprovalStore();
    const queue = createInMemoryApprovalQueue(store);

    const _promise = queue.request('a-1', 'r-1', { plan: 'x' }, '2026-04-24T00:00:00.000Z');

    const pending = await store.get('a-1');
    expect(pending?.status).toBe('pending');
    expect(pending?.runId).toBe('r-1');

    await queue.resolve('a-1', { kind: 'approve' }, '2026-04-24T01:00:00.000Z');
    await _promise;
  });

  it('multiple approvals resolve independently', async () => {
    const store = createInMemoryApprovalStore();
    const queue = createInMemoryApprovalQueue(store);

    const p1 = queue.request('a-1', 'r-1', {}, '2026-04-24T00:00:00.000Z');
    const p2 = queue.request('a-2', 'r-1', {}, '2026-04-24T00:00:00.000Z');

    await queue.resolve('a-2', { kind: 'reject', reason: 'no' }, '2026-04-24T01:00:00.000Z');
    await queue.resolve('a-1', { kind: 'approve' }, '2026-04-24T01:00:00.000Z');

    expect(await p1).toEqual({ kind: 'approve' });
    expect(await p2).toEqual({ kind: 'reject', reason: 'no' });
  });
});
