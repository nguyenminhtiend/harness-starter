import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createPersistence, type Persistence } from './persistence.ts';

let db: Persistence;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  db = createPersistence(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('settings', () => {
  it('returns undefined for missing key', () => {
    expect(db.getSetting('missing')).toBeUndefined();
  });

  it('upserts and gets a setting', () => {
    db.upsertSetting('model', 'gpt-4');
    expect(db.getSetting('model')).toBe('gpt-4');
  });

  it('overwrites on second upsert', () => {
    db.upsertSetting('model', 'gpt-3.5');
    db.upsertSetting('model', 'gpt-4');
    expect(db.getSetting('model')).toBe('gpt-4');
  });

  it('stores and retrieves JSON objects', () => {
    const obj = { a: 1, b: [2, 3] };
    db.upsertSetting('complex', obj);
    expect(db.getSetting('complex')).toEqual(obj);
  });

  it('gets all settings', () => {
    db.upsertSetting('a', 1);
    db.upsertSetting('b', 'two');
    const all = db.getAllSettings();
    expect(all).toEqual({ a: 1, b: 'two' });
  });

  it('deleteSetting removes a key', () => {
    db.upsertSetting('temp', 'gone');
    expect(db.getSetting('temp')).toBe('gone');
    db.deleteSetting('temp');
    expect(db.getSetting('temp')).toBeUndefined();
  });
});

describe('runs', () => {
  it('creates and gets a run', () => {
    db.createRun({ id: 'r1', toolId: 'deep-research', question: 'What is X?', status: 'pending' });
    const run = db.getRun('r1');
    expect(run).toBeDefined();
    expect(run?.id).toBe('r1');
    expect(run?.toolId).toBe('deep-research');
    expect(run?.question).toBe('What is X?');
    expect(run?.status).toBe('pending');
    expect(run?.createdAt).toBeDefined();
  });

  it('returns undefined for missing run', () => {
    expect(db.getRun('nope')).toBeUndefined();
  });

  it('updates a run', () => {
    db.createRun({ id: 'r1', toolId: 't1', question: 'q', status: 'pending' });
    db.updateRun('r1', { status: 'completed', costUsd: 0.42 });
    const run = db.getRun('r1');
    expect(run?.status).toBe('completed');
    expect(run?.costUsd).toBe(0.42);
  });

  it('lists runs ordered by createdAt desc', () => {
    db.createRun({ id: 'r1', toolId: 't1', question: 'first', status: 'completed' });
    db.createRun({ id: 'r2', toolId: 't1', question: 'second', status: 'running' });
    const runs = db.listRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0].id).toBe('r2');
    expect(runs[1].id).toBe('r1');
  });

  it('filters runs by status', () => {
    db.createRun({ id: 'r1', toolId: 't1', question: 'a', status: 'completed' });
    db.createRun({ id: 'r2', toolId: 't1', question: 'b', status: 'running' });
    const runs = db.listRuns({ status: 'completed' });
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('r1');
  });

  it('searches runs by question text', () => {
    db.createRun({ id: 'r1', toolId: 't1', question: 'What are CRDTs?', status: 'completed' });
    db.createRun({ id: 'r2', toolId: 't1', question: 'Tell me about React', status: 'completed' });
    const runs = db.listRuns({ q: 'CRDT' });
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('r1');
  });

  it('limits run results', () => {
    for (let i = 0; i < 5; i++) {
      db.createRun({ id: `r${i}`, toolId: 't1', question: `q${i}`, status: 'completed' });
    }
    const runs = db.listRuns({ limit: 2 });
    expect(runs).toHaveLength(2);
  });
});

describe('events', () => {
  it('appends and gets events ordered by seq', () => {
    db.createRun({ id: 'r1', toolId: 't1', question: 'q', status: 'running' });
    db.appendEvent('r1', { type: 'status', status: 'running', ts: 1000, runId: 'r1' });
    db.appendEvent('r1', { type: 'agent', phase: 'plan', ts: 1001, runId: 'r1' });

    const events = db.getEvents('r1');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('status');
    expect(events[1].type).toBe('agent');
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
  });

  it('returns empty array for run with no events', () => {
    db.createRun({ id: 'r1', toolId: 't1', question: 'q', status: 'running' });
    expect(db.getEvents('r1')).toEqual([]);
  });
});

describe('schema auto-creation', () => {
  it('creates DB file at the expected path', () => {
    const dbPath = path.join(tmpDir, 'web-studio.db');
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
