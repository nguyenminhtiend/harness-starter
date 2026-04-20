import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHitlSessionStore } from './active-hitl-sessions.ts';
import { createApprovalStore } from './approval.ts';
import { createApp } from './index.ts';
import { createPersistence, type Persistence } from './persistence.ts';

let persistence: Persistence;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-app-'));
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
    approvalStore: createApprovalStore(),
    hitlSessionStore: createHitlSessionStore(),
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

  it('GET /api/runs returns 200 with empty list', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: unknown[] };
    expect(body.runs).toEqual([]);
  });

  it('GET /api/settings returns 200 with defaults', async () => {
    const app = makeApp();
    const res = await app.request('/api/settings');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { global: unknown; tools: unknown };
    expect(body.global).toBeDefined();
    expect(body.tools).toBeDefined();
  });

  it('POST /api/runs validates input', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/runs creates a run', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs', {
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

    const run = persistence.getRun(body.id);
    expect(run?.status).toBe('running');
  });

  it('POST /api/runs accepts optional resumeRunId (ignored until resume is implemented)', async () => {
    const app = makeApp();
    const priorId = '00000000-0000-4000-8000-000000000001';
    const res = await app.request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolId: 'deep-research',
        question: 'Resume test?',
        resumeRunId: priorId,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBeDefined();
    expect(body.id).not.toBe(priorId);
    const run = persistence.getRun(body.id);
    expect(run?.question).toBe('Resume test?');
  });

  it('GET /api/runs/:id returns 404 for missing run', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PUT /api/settings persists and retrieves', async () => {
    const app = makeApp();

    const putRes = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        settings: { defaultModel: 'gpt-4o' },
      }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await app.request('/api/settings');
    const body = (await getRes.json()) as { global: { defaultModel: string } };
    expect(body.global.defaultModel).toBe('gpt-4o');
  });

  it('POST /api/runs/:id/cancel returns 404 for unknown run', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs/nope/cancel', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
