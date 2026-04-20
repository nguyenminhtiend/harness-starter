import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inMemoryCheckpointer } from '@harness/agent';
import { registerHitlRunSession, unregisterHitlRunSession } from '../active-hitl-sessions.ts';
import { waitForApproval } from '../approval.ts';
import { createApp } from '../index.ts';
import { createPersistence, type Persistence } from '../persistence.ts';

let persistence: Persistence;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-approve-'));
  persistence = createPersistence(tmpDir);
});

afterEach(() => {
  persistence.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp() {
  return createApp({
    persistence,
    getApiKey: () => 'test-key',
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
    persistence.createRun({
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

  it('returns 404 when there is no pending approval', async () => {
    const app = makeApp();
    persistence.createRun({
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
    persistence.createRun({
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
    registerHitlRunSession(runId, { checkpointer, abortController: ac });

    const approvalPromise = waitForApproval(runId);

    const res = await app.request(`/api/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const decision = await approvalPromise;
    expect(decision).toEqual({ decision: 'approve' });

    const stored = persistence.getEvents(runId);
    const resolved = stored.filter((e) => e.type === 'hitl-resolved');
    expect(resolved.length).toBe(1);
    expect(resolved[0]?.payload.decision).toBe('approve');

    unregisterHitlRunSession(runId);
  });

  it('returns 400 when editedPlan is invalid', async () => {
    const app = makeApp();
    const runId = 'run-hitl-bad-plan';
    persistence.createRun({
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

    registerHitlRunSession(runId, {
      checkpointer,
      abortController: new AbortController(),
    });

    void waitForApproval(runId);

    const res = await app.request(`/api/runs/${runId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', editedPlan: { invalid: true } }),
    });

    expect(res.status).toBe(400);

    unregisterHitlRunSession(runId);
  });
});
