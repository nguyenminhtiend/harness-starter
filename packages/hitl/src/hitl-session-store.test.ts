import { describe, expect, it } from 'bun:test';
import { inMemoryCheckpointer } from '@harness/agent';
import { createHitlSessionStore } from './hitl-session-store.ts';

describe('HitlSessionStore', () => {
  it('get returns undefined for unregistered session', () => {
    const store = createHitlSessionStore();
    expect(store.get('run-1')).toBeUndefined();
  });

  it('register + get returns the session', () => {
    const store = createHitlSessionStore();
    const session = {
      checkpointer: inMemoryCheckpointer(),
      abortController: new AbortController(),
    };
    store.register('run-1', session);
    expect(store.get('run-1')).toBe(session);
  });

  it('unregister removes the session', () => {
    const store = createHitlSessionStore();
    const session = {
      checkpointer: inMemoryCheckpointer(),
      abortController: new AbortController(),
    };
    store.register('run-1', session);
    store.unregister('run-1');
    expect(store.get('run-1')).toBeUndefined();
  });

  it('unregister is idempotent for missing session', () => {
    const store = createHitlSessionStore();
    expect(() => store.unregister('run-1')).not.toThrow();
  });

  it('register overwrites existing session (idempotent)', () => {
    const store = createHitlSessionStore();
    const s1 = { checkpointer: inMemoryCheckpointer(), abortController: new AbortController() };
    const s2 = { checkpointer: inMemoryCheckpointer(), abortController: new AbortController() };
    store.register('run-1', s1);
    store.register('run-1', s2);
    expect(store.get('run-1')).toBe(s2);
  });

  it('abort propagates via stored AbortController', () => {
    const store = createHitlSessionStore();
    const ac = new AbortController();
    store.register('run-1', { checkpointer: inMemoryCheckpointer(), abortController: ac });
    const session = store.get('run-1');
    session?.abortController.abort();
    expect(ac.signal.aborted).toBe(true);
  });
});
