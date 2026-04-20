import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createDatabase } from '../../infra/db.ts';
import { createRunStore, type RunStore } from './runs.store.ts';

let db: Database;
let store: RunStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runstore-'));
  db = createDatabase(tmpDir);
  store = createRunStore(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runs', () => {
  it('creates and gets a run', () => {
    store.createRun({
      id: 'r1',
      toolId: 'deep-research',
      question: 'What is X?',
      status: 'pending',
    });
    const run = store.getRun('r1');
    expect(run).toBeDefined();
    expect(run?.id).toBe('r1');
    expect(run?.toolId).toBe('deep-research');
    expect(run?.question).toBe('What is X?');
    expect(run?.status).toBe('pending');
    expect(run?.createdAt).toBeDefined();
  });

  it('returns undefined for missing run', () => {
    expect(store.getRun('nope')).toBeUndefined();
  });

  it('updates a run', () => {
    store.createRun({ id: 'r1', toolId: 't1', question: 'q', status: 'pending' });
    store.updateRun('r1', { status: 'completed', costUsd: 0.42 });
    const run = store.getRun('r1');
    expect(run?.status).toBe('completed');
    expect(run?.costUsd).toBe(0.42);
  });

  it('lists runs ordered by createdAt desc', () => {
    store.createRun({ id: 'r1', toolId: 't1', question: 'first', status: 'completed' });
    store.createRun({ id: 'r2', toolId: 't1', question: 'second', status: 'running' });
    const runs = store.listRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe('r2');
    expect(runs[1].id).toBe('r1');
  });

  it('filters runs by status', () => {
    store.createRun({ id: 'r1', toolId: 't1', question: 'a', status: 'completed' });
    store.createRun({ id: 'r2', toolId: 't1', question: 'b', status: 'running' });
    const runs = store.listRuns({ status: 'completed' });
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('r1');
  });

  it('searches runs by question text', () => {
    store.createRun({ id: 'r1', toolId: 't1', question: 'What are CRDTs?', status: 'completed' });
    store.createRun({
      id: 'r2',
      toolId: 't1',
      question: 'Tell me about React',
      status: 'completed',
    });
    const runs = store.listRuns({ q: 'CRDT' });
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('r1');
  });

  it('limits run results', () => {
    for (let i = 0; i < 5; i++) {
      store.createRun({ id: `r${i}`, toolId: 't1', question: `q${i}`, status: 'completed' });
    }
    const runs = store.listRuns({ limit: 2 });
    expect(runs).toHaveLength(2);
  });
});

describe('events', () => {
  it('appends and gets events ordered by seq', () => {
    store.createRun({ id: 'r1', toolId: 't1', question: 'q', status: 'running' });
    store.appendEvent('r1', { type: 'status', status: 'running', ts: 1000, runId: 'r1' });
    store.appendEvent('r1', { type: 'agent', phase: 'plan', ts: 1001, runId: 'r1' });

    const events = store.getEvents('r1');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('status');
    expect(events[1].type).toBe('agent');
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
  });

  it('returns empty array for run with no events', () => {
    store.createRun({ id: 'r1', toolId: 't1', question: 'q', status: 'running' });
    expect(store.getEvents('r1')).toEqual([]);
  });
});
