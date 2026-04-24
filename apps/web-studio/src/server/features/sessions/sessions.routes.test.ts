import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../../index.ts';
import { createApprovalStore } from '../../infra/approval.ts';
import { createDatabase } from '../../infra/db.ts';
import { createSessionStore, type SessionStore } from '../../infra/session-store.ts';
import { createSettingsStore, type SettingsStore } from '../settings/settings.store.ts';

let db: Database;
let sessionStore: SessionStore;
let settingsStore: SettingsStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-sessions-route-'));
  db = createDatabase(tmpDir);
  sessionStore = createSessionStore(db);
  settingsStore = createSettingsStore(db);
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
    approvalStore: createApprovalStore(),
  });
}

describe('POST /api/sessions', () => {
  it('returns 400 for invalid JSON body', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('JSON');
  });

  it('returns 400 when toolId is unknown', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolId: 'no-such-tool',
        question: 'What?',
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unknown tool');
  });
});

describe('GET /api/sessions', () => {
  it('filters by status, question search, and limit', async () => {
    sessionStore.createSession({
      id: 'a',
      toolId: 't',
      question: 'Alpha',
      status: 'completed',
    });
    sessionStore.createSession({ id: 'b', toolId: 't', question: 'Beta', status: 'running' });
    const app = makeApp();

    const byStatus = await app.request('/api/sessions?status=completed');
    expect(byStatus.status).toBe(200);
    const sBody = (await byStatus.json()) as { sessions: { id: string }[] };
    expect(sBody.sessions).toHaveLength(1);
    expect(sBody.sessions[0]?.id).toBe('a');

    const byQ = await app.request('/api/sessions?q=Beta');
    const qBody = (await byQ.json()) as { sessions: { id: string }[] };
    expect(qBody.sessions).toHaveLength(1);
    expect(qBody.sessions[0]?.id).toBe('b');

    const limited = await app.request('/api/sessions?limit=1');
    const lBody = (await limited.json()) as { sessions: { id: string }[] };
    expect(lBody.sessions).toHaveLength(1);
    expect(lBody.sessions[0]?.id).toBe('b');
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns session metadata when present', async () => {
    sessionStore.createSession({
      id: 'sid-1',
      toolId: 'deep-research',
      question: 'Q?',
      status: 'completed',
    });
    const app = makeApp();
    const res = await app.request('/api/sessions/sid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; question: string };
    expect(body.id).toBe('sid-1');
    expect(body.question).toBe('Q?');
  });
});

describe('GET /api/sessions/:id/events', () => {
  it('returns 404 when session does not exist', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions/missing/events');
    expect(res.status).toBe(404);
  });

  it('replays persisted events and ends with done', async () => {
    const sessionId = 'replay-1';
    sessionStore.createSession({
      id: sessionId,
      toolId: 'deep-research',
      question: 'Q',
      status: 'completed',
    });
    sessionStore.appendEvent(sessionId, {
      type: 'status',
      status: 'completed',
      ts: 1,
    });
    sessionStore.appendEvent(sessionId, {
      type: 'done',
      ts: 2,
      totalTokens: 3,
    });

    const app = makeApp();
    const res = await app.request(`/api/sessions/${sessionId}/events`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('done');
    expect(text).toContain('completed');
  });

  it('streams cancellation path when session is cancelled before SSE starts', async () => {
    const app = makeApp();
    const postRes = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId: 'deep-research', question: 'cancel me' }),
    });
    expect(postRes.status).toBe(200);
    const { id } = (await postRes.json()) as { id: string };

    const cancelRes = await app.request(`/api/sessions/${id}/cancel`, { method: 'POST' });
    expect(cancelRes.status).toBe(200);

    const sseRes = await app.request(`/api/sessions/${id}/events`);
    expect(sseRes.status).toBe(200);
    const text = await sseRes.text();
    expect(text.toLowerCase()).toContain('cancel');
    expect(text).toContain('done');
  });
});
