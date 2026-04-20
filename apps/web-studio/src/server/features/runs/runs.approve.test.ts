import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inMemoryCheckpointer } from '@harness/agent';
import { createApp } from '../../index.ts';
import { createDatabase } from '../../infra/db.ts';
import { createSettingsStore, type SettingsStore } from '../settings/settings.store.ts';
import { type ApprovalStore, createApprovalStore } from './runs.approval.ts';
import { createHitlSessionStore, type HitlSessionStore } from './runs.hitl.ts';
import { createRunStore, type RunStore } from './runs.store.ts';

let db: Database;
let runStore: RunStore;
let settingsStore: SettingsStore;
let tmpDir: string;
let approvalStore: ApprovalStore;
let hitlSessionStore: HitlSessionStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-approve-'));
  db = createDatabase(tmpDir);
  runStore = createRunStore(db);
  settingsStore = createSettingsStore(db);
  approvalStore = createApprovalStore();
  hitlSessionStore = createHitlSessionStore();
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp() {
  return createApp({
    runStore,
    settingsStore,
    getProviderKeys: () => ({ google: 'test-key', openrouter: 'test-key' }),
    approvalStore,
    hitlSessionStore,
  });
}

describe('POST /api/runs/:id/approve', () => {
  it('returns 404 when run does not exist', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs/missing/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const app = makeApp();
    runStore.createRun({
      id: 'r1',
      toolId: 'deep-research',
      question: 'q',
      status: 'running',
    });
    const res = await app.request('/api/runs/r1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'maybe' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const app = makeApp();
    runStore.createRun({
      id: 'r-json',
      toolId: 'deep-research',
      question: 'q',
      status: 'running',
    });
    const res = await app.request('/api/runs/r-json/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('JSON');
  });

  it('returns 404 when there is no pending approval', async () => {
    const app = makeApp();
    runStore.createRun({
      id: 'r2',
      toolId: 'deep-research',
      question: 'q',
      status: 'running',
    });
    const res = await app.request('/api/runs/r2/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(404);
  });

  it('resolves pending approval, persists hitl-resolved, and returns 200', async () => {
    const app = makeApp();
    const runId = 'run-hitl-1';
    runStore.createRun({
      id: runId,
      toolId: 'deep-research',
      question: 'What is X?',
      status: 'running',
    });

    const checkpointer = inMemoryCheckpointer();
    await checkpointer.save(runId, {
      runId,
      conversationId: 'conv-1',
      turn: 0,
      messages: [],
      graphState: {
        currentNode: 'approve',
        completed: false,
        data: {
          userMessage: 'What is X?',
          plan: {
            question: 'What is X?',
            subquestions: [{ id: 'q1', question: 'Details?', searchQueries: ['x'] }],
          },
        },
      },
    });

    const ac = new AbortController();
    hitlSessionStore.register(runId, { checkpointer, abortController: ac });

    const approvalPromise = approvalStore.waitFor(runId);

    const res = await app.request(`/api/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const decision = await approvalPromise;
    expect(decision).toEqual({ decision: 'approve' });

    const stored = runStore.getEvents(runId);
    const resolved = stored.filter((e) => e.type === 'hitl-resolved');
    expect(resolved.length).toBe(1);
    expect(resolved[0]?.payload.decision).toBe('approve');

    hitlSessionStore.unregister(runId);
  });

  it('resolves reject decision, aborts session, and returns 200', async () => {
    const app = makeApp();
    const runId = 'run-hitl-reject';
    runStore.createRun({
      id: runId,
      toolId: 'deep-research',
      question: 'What?',
      status: 'running',
    });

    const checkpointer = inMemoryCheckpointer();
    await checkpointer.save(runId, {
      runId,
      conversationId: 'conv-rej',
      turn: 0,
      messages: [],
      graphState: {
        currentNode: 'approve',
        completed: false,
        data: {
          userMessage: 'What?',
          plan: {
            question: 'What?',
            subquestions: [{ id: 'q1', question: 'Details?', searchQueries: ['x'] }],
          },
        },
      },
    });

    const ac = new AbortController();
    hitlSessionStore.register(runId, { checkpointer, abortController: ac });

    const approvalPromise = approvalStore.waitFor(runId);

    const res = await app.request(`/api/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const decision = await approvalPromise;
    expect(decision).toEqual({ decision: 'reject' });
    expect(ac.signal.aborted).toBe(true);

    hitlSessionStore.unregister(runId);
  });

  it('returns 400 when editedPlan is invalid', async () => {
    const app = makeApp();
    const runId = 'run-hitl-bad-plan';
    runStore.createRun({
      id: runId,
      toolId: 'deep-research',
      question: 'q',
      status: 'running',
    });

    const checkpointer = inMemoryCheckpointer();
    await checkpointer.save(runId, {
      runId,
      conversationId: 'conv-2',
      turn: 0,
      messages: [],
      graphState: {
        currentNode: 'approve',
        completed: false,
        data: {
          userMessage: 'q',
          plan: {
            question: 'q',
            subquestions: [{ id: 'q1', question: 's', searchQueries: [] }],
          },
        },
      },
    });

    hitlSessionStore.register(runId, {
      checkpointer,
      abortController: new AbortController(),
    });

    void approvalStore.waitFor(runId);

    const res = await app.request(`/api/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', editedPlan: { invalid: true } }),
    });

    expect(res.status).toBe(400);

    hitlSessionStore.unregister(runId);
  });
});
