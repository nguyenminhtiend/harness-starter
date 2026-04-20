import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { SESSION_STORE_SCHEMA } from './schema.ts';
import type { SessionStore } from './session-store.ts';
import { createSessionStore } from './session-store.ts';

let db: Database;
let store: SessionStore;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SESSION_STORE_SCHEMA);
  store = createSessionStore(db);
});

afterEach(() => {
  db.close();
});

describe('sessions', () => {
  it('creates and gets a session', () => {
    store.createSession({
      id: 's1',
      toolId: 'deep-research',
      question: 'What is X?',
      status: 'pending',
    });
    const session = store.getSession('s1');
    expect(session).toBeDefined();
    expect(session?.id).toBe('s1');
    expect(session?.toolId).toBe('deep-research');
    expect(session?.question).toBe('What is X?');
    expect(session?.status).toBe('pending');
    expect(session?.createdAt).toBeDefined();
  });

  it('returns undefined for missing session', () => {
    expect(store.getSession('nope')).toBeUndefined();
  });

  it('updates a session status', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'pending' });
    store.updateSession('s1', { status: 'completed' });
    const session = store.getSession('s1');
    expect(session?.status).toBe('completed');
  });

  it('updates a session finishedAt', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'running' });
    store.updateSession('s1', { status: 'completed', finishedAt: '2026-01-01T00:00:00Z' });
    const session = store.getSession('s1');
    expect(session?.finishedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('no-ops when update has no fields', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'pending' });
    store.updateSession('s1', {});
    expect(store.getSession('s1')?.status).toBe('pending');
  });

  it('lists sessions ordered by createdAt desc', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'first', status: 'completed' });
    store.createSession({ id: 's2', toolId: 't1', question: 'second', status: 'running' });
    const sessions = store.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.id).toBe('s2');
    expect(sessions[1]?.id).toBe('s1');
  });

  it('filters sessions by status', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'a', status: 'completed' });
    store.createSession({ id: 's2', toolId: 't1', question: 'b', status: 'running' });
    const sessions = store.listSessions({ status: 'completed' });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('s1');
  });

  it('searches sessions by question text', () => {
    store.createSession({
      id: 's1',
      toolId: 't1',
      question: 'What are CRDTs?',
      status: 'completed',
    });
    store.createSession({
      id: 's2',
      toolId: 't1',
      question: 'Tell me about React',
      status: 'completed',
    });
    const sessions = store.listSessions({ q: 'CRDT' });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('s1');
  });

  it('limits session results', () => {
    for (let i = 0; i < 5; i++) {
      store.createSession({
        id: `s${i}`,
        toolId: 't1',
        question: `q${i}`,
        status: 'completed',
      });
    }
    const sessions = store.listSessions({ limit: 2 });
    expect(sessions).toHaveLength(2);
  });

  it('clamps limit to safe range', () => {
    for (let i = 0; i < 3; i++) {
      store.createSession({
        id: `s${i}`,
        toolId: 't1',
        question: `q${i}`,
        status: 'completed',
      });
    }
    const sessions = store.listSessions({ limit: -10 });
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a session and its events', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'running' });
    store.appendEvent('s1', { type: 'status', ts: 1000, status: 'running', runId: 's1' });
    store.deleteSession('s1');
    expect(store.getSession('s1')).toBeUndefined();
    expect(store.getEvents('s1')).toEqual([]);
  });
});

describe('events', () => {
  it('appends and gets events ordered by seq', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'running' });
    store.appendEvent('s1', { type: 'status', status: 'running', ts: 1000, runId: 's1' });
    store.appendEvent('s1', { type: 'agent', phase: 'plan', ts: 1001, runId: 's1' });

    const events = store.getEvents('s1');
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('status');
    expect(events[1]?.type).toBe('agent');
    expect(events[0]?.seq).toBe(1);
    expect(events[1]?.seq).toBe(2);
  });

  it('returns empty array for session with no events', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'running' });
    expect(store.getEvents('s1')).toEqual([]);
  });

  it('stores payload fields beyond type and ts', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'running' });
    store.appendEvent('s1', {
      type: 'tool',
      ts: 1000,
      runId: 's1',
      toolName: 'search',
      args: { q: 'test' },
    });
    const events = store.getEvents('s1');
    expect(events[0]?.payload.toolName).toBe('search');
    expect(events[0]?.payload.args).toEqual({ q: 'test' });
  });

  it('seq counter survives across multiple appends', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'running' });
    for (let i = 0; i < 5; i++) {
      store.appendEvent('s1', { type: 'status', ts: 1000 + i, runId: 's1' });
    }
    const events = store.getEvents('s1');
    expect(events).toHaveLength(5);
    expect(events[4]?.seq).toBe(5);
  });

  it('seq counter initializes from DB on fresh store instance', () => {
    store.createSession({ id: 's1', toolId: 't1', question: 'q', status: 'running' });
    store.appendEvent('s1', { type: 'status', ts: 1000, runId: 's1' });
    store.appendEvent('s1', { type: 'status', ts: 1001, runId: 's1' });

    const store2 = createSessionStore(db);
    store2.appendEvent('s1', { type: 'status', ts: 1002, runId: 's1' });
    const events = store2.getEvents('s1');
    expect(events).toHaveLength(3);
    expect(events[2]?.seq).toBe(3);
  });
});
