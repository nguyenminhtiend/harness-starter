import { describe, expect, it } from 'bun:test';
import { createApprovalStore } from './approval-store.ts';

describe('ApprovalStore', () => {
  it('hasPending returns false when no pending approval', () => {
    const store = createApprovalStore();
    expect(store.hasPending('run-1')).toBe(false);
  });

  it('hasPending returns true after waitFor is called', () => {
    const store = createApprovalStore();
    void store.waitFor('run-1');
    expect(store.hasPending('run-1')).toBe(true);
  });

  it('resolve wakes waitFor with the decision', async () => {
    const store = createApprovalStore();
    const promise = store.waitFor('run-1');
    const resolved = store.resolve('run-1', { decision: 'approve' });
    expect(resolved).toBe(true);
    const result = await promise;
    expect(result).toEqual({ decision: 'approve' });
  });

  it('resolve returns false when no pending approval exists', () => {
    const store = createApprovalStore();
    expect(store.resolve('run-1', { decision: 'reject' })).toBe(false);
  });

  it('hasPending returns false after resolve', () => {
    const store = createApprovalStore();
    void store.waitFor('run-1');
    store.resolve('run-1', { decision: 'approve' });
    expect(store.hasPending('run-1')).toBe(false);
  });

  it('passes editedPlan through resolve', async () => {
    const store = createApprovalStore();
    const promise = store.waitFor('run-1');
    store.resolve('run-1', { decision: 'approve', editedPlan: { steps: ['a'] } });
    const result = await promise;
    expect(result.editedPlan).toEqual({ steps: ['a'] });
  });

  it('concurrent waitFor calls for different runIds are independent', async () => {
    const store = createApprovalStore();
    const p1 = store.waitFor('run-1');
    const p2 = store.waitFor('run-2');

    store.resolve('run-2', { decision: 'reject' });
    store.resolve('run-1', { decision: 'approve' });

    expect(await p1).toEqual({ decision: 'approve' });
    expect(await p2).toEqual({ decision: 'reject' });
  });
});
