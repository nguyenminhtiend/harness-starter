import { describe, expect, it } from 'bun:test';
import type { ApprovalDecision, PendingApproval } from '../domain/approval.ts';
import type { ApprovalCoordinator } from './approval-coordinator.ts';
import { createInMemoryApprovalCoordinator } from './approval-coordinator.ts';

function make(): ApprovalCoordinator {
  return createInMemoryApprovalCoordinator();
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

describe('ApprovalCoordinator', () => {
  it('creates and retrieves a pending approval', async () => {
    const coord = make();
    const approval = makePending('a-1', 'r-1');
    await coord.createPending(approval);

    const stored = await coord.get('a-1');
    expect(stored).toEqual(approval);
  });

  it('returns undefined for non-existent approval', async () => {
    const coord = make();
    expect(await coord.get('nope')).toBeUndefined();
  });

  it('resolves a pending approval with approve decision', async () => {
    const coord = make();
    await coord.createPending(makePending('a-1', 'r-1'));

    const resolvedAt = '2026-04-24T01:00:00.000Z';
    await coord.resolve('a-1', { kind: 'approve' }, resolvedAt);

    const stored = await coord.get('a-1');
    expect(stored?.status).toBe('resolved');
    expect(stored?.decision).toEqual({ kind: 'approve' });
    expect(stored?.resolvedAt).toBe(resolvedAt);
  });

  it('resolves a pending approval with reject decision', async () => {
    const coord = make();
    await coord.createPending(makePending('a-1', 'r-1'));

    await coord.resolve('a-1', { kind: 'reject', reason: 'bad' }, '2026-04-24T01:00:00.000Z');

    const stored = await coord.get('a-1');
    expect(stored?.status).toBe('resolved');
    expect(stored?.decision).toEqual({ kind: 'reject', reason: 'bad' });
  });

  it('lists pending approvals for a run', async () => {
    const coord = make();
    await coord.createPending(makePending('a-1', 'r-1'));
    await coord.createPending(makePending('a-2', 'r-1'));
    await coord.createPending(makePending('a-3', 'r-2'));

    const pending = await coord.listPending('r-1');
    expect(pending).toHaveLength(2);
    expect(pending.map((a) => a.id).sort()).toEqual(['a-1', 'a-2']);
  });

  it('resolved approvals are excluded from listPending', async () => {
    const coord = make();
    await coord.createPending(makePending('a-1', 'r-1'));
    await coord.resolve('a-1', { kind: 'approve' }, '2026-04-24T01:00:00.000Z');

    const pending = await coord.listPending('r-1');
    expect(pending).toHaveLength(0);
  });

  it('request() resolves when resolve() is called after', async () => {
    const coord = make();

    const requestPromise = coord.request(
      'a-1',
      'r-1',
      { plan: 'test' },
      '2026-04-24T00:00:00.000Z',
    );

    const decision: ApprovalDecision = { kind: 'approve' };
    await coord.resolve('a-1', decision, '2026-04-24T01:00:00.000Z');

    const result = await requestPromise;
    expect(result).toEqual(decision);
  });

  it('resolve() before request() — early decision delivered immediately', async () => {
    const coord = make();

    await coord.createPending(makePending('a-1', 'r-1'));

    const decision: ApprovalDecision = { kind: 'reject', reason: 'bad' };
    await coord.resolve('a-1', decision, '2026-04-24T01:00:00.000Z');

    const stored = await coord.get('a-1');
    expect(stored?.status).toBe('resolved');
    expect(stored?.decision).toEqual(decision);
  });

  it('request() persists pending approval', async () => {
    const coord = make();

    const _promise = coord.request('a-1', 'r-1', { plan: 'x' }, '2026-04-24T00:00:00.000Z');

    const pending = await coord.get('a-1');
    expect(pending?.status).toBe('pending');
    expect(pending?.runId).toBe('r-1');

    await coord.resolve('a-1', { kind: 'approve' }, '2026-04-24T01:00:00.000Z');
    await _promise;
  });

  it('multiple approvals resolve independently', async () => {
    const coord = make();

    const p1 = coord.request('a-1', 'r-1', {}, '2026-04-24T00:00:00.000Z');
    const p2 = coord.request('a-2', 'r-1', {}, '2026-04-24T00:00:00.000Z');

    await coord.resolve('a-2', { kind: 'reject', reason: 'no' }, '2026-04-24T01:00:00.000Z');
    await coord.resolve('a-1', { kind: 'approve' }, '2026-04-24T01:00:00.000Z');

    expect(await p1).toEqual({ kind: 'approve' });
    expect(await p2).toEqual({ kind: 'reject', reason: 'no' });
  });

  it('returns empty array for run with no pending approvals', async () => {
    const coord = make();
    expect(await coord.listPending('nope')).toEqual([]);
  });
});
