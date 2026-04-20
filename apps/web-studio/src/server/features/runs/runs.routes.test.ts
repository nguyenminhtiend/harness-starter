import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../../index.ts';
import { createDatabase } from '../../infra/db.ts';
import { createSettingsStore, type SettingsStore } from '../settings/settings.store.ts';
import { createApprovalStore } from './runs.approval.ts';
import { createHitlSessionStore } from './runs.hitl.ts';
import { createRunStore, type RunStore } from './runs.store.ts';

let db: Database;
let runStore: RunStore;
let settingsStore: SettingsStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runs-route-'));
  db = createDatabase(tmpDir);
  runStore = createRunStore(db);
  settingsStore = createSettingsStore(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp() {
  return createApp({
    runStore,
    settingsStore,
    getApiKey: () => 'test-key',
    approvalStore: createApprovalStore(),
    hitlSessionStore: createHitlSessionStore(),
  });
}

describe('POST /api/runs', () => {
  it('returns 400 for invalid JSON body', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs', {
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
    const res = await app.request('/api/runs', {
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

describe('GET /api/runs', () => {
  it('filters by status, question search, and limit', async () => {
    runStore.createRun({ id: 'a', toolId: 't', question: 'Alpha', status: 'completed' });
    runStore.createRun({ id: 'b', toolId: 't', question: 'Beta', status: 'running' });
    const app = makeApp();

    const byStatus = await app.request('/api/runs?status=completed');
    expect(byStatus.status).toBe(200);
    const sBody = (await byStatus.json()) as { runs: { id: string }[] };
    expect(sBody.runs).toHaveLength(1);
    expect(sBody.runs[0]?.id).toBe('a');

    const byQ = await app.request('/api/runs?q=Beta');
    const qBody = (await byQ.json()) as { runs: { id: string }[] };
    expect(qBody.runs).toHaveLength(1);
    expect(qBody.runs[0]?.id).toBe('b');

    const limited = await app.request('/api/runs?limit=1');
    const lBody = (await limited.json()) as { runs: { id: string }[] };
    expect(lBody.runs).toHaveLength(1);
    expect(lBody.runs[0]?.id).toBe('b');
  });
});

describe('GET /api/runs/:id', () => {
  it('returns run metadata when present', async () => {
    runStore.createRun({
      id: 'rid-1',
      toolId: 'deep-research',
      question: 'Q?',
      status: 'completed',
    });
    const app = makeApp();
    const res = await app.request('/api/runs/rid-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; question: string };
    expect(body.id).toBe('rid-1');
    expect(body.question).toBe('Q?');
  });
});

describe('GET /api/runs/:id/events', () => {
  it('returns 404 when run does not exist', async () => {
    const app = makeApp();
    const res = await app.request('/api/runs/missing/events');
    expect(res.status).toBe(404);
  });

  it('replays persisted events and ends with done', async () => {
    const runId = 'replay-1';
    runStore.createRun({
      id: runId,
      toolId: 'deep-research',
      question: 'Q',
      status: 'completed',
    });
    runStore.appendEvent(runId, { type: 'status', status: 'completed', ts: 1, runId });
    runStore.appendEvent(runId, {
      type: 'complete',
      ts: 2,
      runId,
      totalTokens: 3,
      totalCostUsd: 0,
    });

    const app = makeApp();
    const res = await app.request(`/api/runs/${runId}/events`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('done');
    expect(text).toContain('complete');
    expect(text).toContain('completed');
  });

  it('streams cancellation path when run is cancelled before SSE starts', async () => {
    const app = makeApp();
    const postRes = await app.request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolId: 'deep-research', question: 'cancel me' }),
    });
    expect(postRes.status).toBe(200);
    const { id } = (await postRes.json()) as { id: string };

    const cancelRes = await app.request(`/api/runs/${id}/cancel`, { method: 'POST' });
    expect(cancelRes.status).toBe(200);

    const sseRes = await app.request(`/api/runs/${id}/events`);
    expect(sseRes.status).toBe(200);
    const text = await sseRes.text();
    expect(text.toLowerCase()).toContain('cancel');
    expect(text).toContain('done');
  });
});
