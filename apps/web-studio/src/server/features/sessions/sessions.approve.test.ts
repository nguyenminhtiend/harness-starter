import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../../index.ts';
import { type ApprovalStore, createApprovalStore } from '../../infra/approval.ts';
import { createDatabase } from '../../infra/db.ts';
import { createSessionStore, type SessionStore } from '../../infra/session-store.ts';
import { createSettingsStore, type SettingsStore } from '../settings/settings.store.ts';

let db: Database;
let sessionStore: SessionStore;
let settingsStore: SettingsStore;
let tmpDir: string;
let approvalStore: ApprovalStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-approve-'));
  db = createDatabase(tmpDir);
  sessionStore = createSessionStore(db);
  settingsStore = createSettingsStore(db);
  approvalStore = createApprovalStore();
});

afterEach(async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp() {
  return createApp({
    sessionStore,
    settingsStore,
    getProviderKeys: () => ({ google: 'test-key', openrouter: 'test-key' }),
    approvalStore,
  });
}

describe('POST /api/sessions/:id/approve', () => {
  it('returns 404 when session does not exist', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions/missing/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const app = makeApp();
    sessionStore.createSession({
      id: 's1',
      toolId: 'deep-research',
      question: 'q',
      status: 'running',
    });
    const res = await app.request('/api/sessions/s1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'maybe' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const app = makeApp();
    sessionStore.createSession({
      id: 's-json',
      toolId: 'deep-research',
      question: 'q',
      status: 'running',
    });
    const res = await app.request('/api/sessions/s-json/approve', {
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
    sessionStore.createSession({
      id: 's2',
      toolId: 'deep-research',
      question: 'q',
      status: 'running',
    });
    const res = await app.request('/api/sessions/s2/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(res.status).toBe(404);
  });

  it('resolves pending approval, persists hitl-resolved, and returns 200', async () => {
    const app = makeApp();
    const sessionId = 'session-hitl-1';
    sessionStore.createSession({
      id: sessionId,
      toolId: 'deep-research',
      question: 'What is X?',
      status: 'running',
    });

    const approvalPromise = approvalStore.waitFor(sessionId);

    const res = await app.request(`/api/sessions/${sessionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const decision = await approvalPromise;
    expect(decision).toEqual({ decision: 'approve' });

    const stored = sessionStore.getEvents(sessionId);
    const resolved = stored.filter((e) => e.type === 'hitl-resolved');
    expect(resolved.length).toBe(1);
    expect(resolved[0]?.payload.decision).toBe('approve');
  });

  it('resolves reject decision and returns 200', async () => {
    const app = makeApp();
    const sessionId = 'session-hitl-reject';
    sessionStore.createSession({
      id: sessionId,
      toolId: 'deep-research',
      question: 'What?',
      status: 'running',
    });

    const approvalPromise = approvalStore.waitFor(sessionId);

    const res = await app.request(`/api/sessions/${sessionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const decision = await approvalPromise;
    expect(decision).toEqual({ decision: 'reject' });
  });
});
