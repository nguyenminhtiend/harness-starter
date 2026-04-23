import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createSettingsStore, type SettingsStore } from './features/settings/settings.store.ts';
import { createApp } from './index.ts';
import { createApprovalStore } from './infra/approval.ts';
import { createDatabase } from './infra/db.ts';
import { createSessionStore, type SessionStore } from './infra/session-store.ts';

let db: Database;
let sessionStore: SessionStore;
let settingsStore: SettingsStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-app-'));
  db = createDatabase(tmpDir);
  sessionStore = createSessionStore(db);
  settingsStore = createSettingsStore(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp() {
  return createApp({
    sessionStore,
    settingsStore,
    getProviderKeys: () => ({ google: 'test-key', openrouter: 'test-key', groq: 'test-key' }),
    approvalStore: createApprovalStore(),
  });
}

describe('web-studio server', () => {
  it('GET /api/health returns 200 with ok status', async () => {
    const app = makeApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('GET /api/tools returns 200 with tool list', async () => {
    const app = makeApp();
    const res = await app.request('/api/tools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: unknown[] };
    expect(body.tools.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/sessions returns 200 with empty list', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: unknown[] };
    expect(body.sessions).toEqual([]);
  });

  it('GET /api/settings returns 200 with defaults', async () => {
    const app = makeApp();
    const res = await app.request('/api/settings');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { global: unknown; tools: unknown };
    expect(body.global).toBeDefined();
    expect(body.tools).toBeDefined();
  });

  it('POST /api/sessions validates input', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/sessions creates a session', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolId: 'deep-research',
        question: 'What is X?',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBeDefined();

    const session = sessionStore.getSession(body.id);
    expect(session?.status).toBe('running');
  });

  it('POST /api/sessions accepts optional resumeSessionId (ignored until resume is implemented)', async () => {
    const app = makeApp();
    const priorId = '00000000-0000-4000-8000-000000000001';
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolId: 'deep-research',
        question: 'Resume test?',
        resumeSessionId: priorId,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBeDefined();
    expect(body.id).not.toBe(priorId);
    const session = sessionStore.getSession(body.id);
    expect(session?.question).toBe('Resume test?');
  });

  it('GET /api/sessions/:id returns 404 for missing session', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PUT /api/settings persists and retrieves', async () => {
    const app = makeApp();

    const putRes = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        settings: { budgetUsd: 1.5 },
      }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await app.request('/api/settings');
    const body = (await getRes.json()) as { global: { defaultModel: string; budgetUsd: number } };
    expect(body.global.defaultModel).toBe('google:gemini-2.5-flash');
    expect(body.global.budgetUsd).toBe(1.5);
  });

  it('POST /api/sessions/:id/cancel returns 404 for unknown session', async () => {
    const app = makeApp();
    const res = await app.request('/api/sessions/nope/cancel', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('GET /api/models returns models for configured providers', async () => {
    const app = makeApp();
    const res = await app.request('/api/models');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { models: Array<{ id: string; provider: string }> };
    expect(body.models.length).toBeGreaterThan(0);
    const providers = [...new Set(body.models.map((m) => m.provider))];
    expect(providers).toContain('google');
    expect(providers).toContain('groq');
    expect(providers).toContain('openrouter');
  });

  it('GET /api/models omits providers without keys', async () => {
    const app = createApp({
      sessionStore,
      settingsStore,
      getProviderKeys: () => ({ groq: 'test-key' }),
      approvalStore: createApprovalStore(),
    });
    const res = await app.request('/api/models');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { models: Array<{ id: string; provider: string }> };
    const providers = new Set(body.models.map((m) => m.provider));
    expect(providers.has('groq')).toBe(true);
    expect(providers.has('google')).toBe(false);
    expect(providers.has('openrouter')).toBe(false);
  });
});
