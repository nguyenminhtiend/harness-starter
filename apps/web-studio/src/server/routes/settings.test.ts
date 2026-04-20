import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHitlSessionStore } from '../active-hitl-sessions.ts';
import { createApprovalStore } from '../approval.ts';
import { createApp } from '../index.ts';
import { createPersistence, type Persistence } from '../persistence.ts';
import { promptStorageKey } from '../settings-constants.ts';

let persistence: Persistence;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-settings-route-'));
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

describe('GET /api/settings', () => {
  it('returns merged global defaults and per-tool views', async () => {
    const app = makeApp();
    const res = await app.request('/api/settings');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      global: { defaultModel: string };
      tools: Record<
        string,
        { values: Record<string, unknown>; inheritedFromGlobal: Record<string, boolean> }
      >;
    };
    expect(body.global.defaultModel).toBe('openrouter/free');
    const dr = body.tools['deep-research'];
    expect(dr).toBeDefined();
    expect(dr.values.model).toBe('openrouter/free');
    expect(dr.inheritedFromGlobal.model).toBe(true);
  });
});

describe('PUT /api/settings', () => {
  it('merges global settings', async () => {
    const app = makeApp();
    const putRes = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        settings: { defaultModel: 'openrouter/paid', budgetUsd: 1.25 },
      }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await app.request('/api/settings');
    const body = (await getRes.json()) as { global: { defaultModel: string; budgetUsd: number } };
    expect(body.global.defaultModel).toBe('openrouter/paid');
    expect(body.global.budgetUsd).toBe(1.25);
  });

  it('persists tool fields and stores prompts under toolId.prompts.role keys', async () => {
    const app = makeApp();
    const putRes = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'deep-research',
        settings: {
          depth: 'deep',
          plannerPrompt: 'Custom planner',
        },
      }),
    });
    expect(putRes.status).toBe(200);

    expect(persistence.getSetting(promptStorageKey('deep-research', 'planner'))).toBe(
      'Custom planner',
    );
    const row = persistence.getSetting<Record<string, unknown>>('deep-research');
    expect(row?.depth).toBe('deep');
    expect(row?.plannerPrompt).toBeUndefined();

    const getRes = await app.request('/api/settings');
    const body = (await getRes.json()) as {
      tools: Record<string, { values: Record<string, unknown> }>;
    };
    expect(body.tools['deep-research'].values.depth).toBe('deep');
    expect(body.tools['deep-research'].values.plannerPrompt).toBe('Custom planner');
  });

  it('returns 400 for invalid JSON body shape', async () => {
    const app = makeApp();
    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: '', settings: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown scope', async () => {
    const app = makeApp();
    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'unknown-tool',
        settings: { model: 'x' },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unknown');
  });

  it('returns 400 when prompt value is not a string', async () => {
    const app = makeApp();
    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'deep-research',
        settings: { plannerPrompt: 123 },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('deletes persisted prompt when cleared with an empty string', async () => {
    persistence.upsertSetting(promptStorageKey('deep-research', 'planner'), 'was-set');
    const app = makeApp();
    const putRes = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'deep-research',
        settings: { plannerPrompt: '' },
      }),
    });
    expect(putRes.status).toBe(200);
    expect(persistence.getSetting(promptStorageKey('deep-research', 'planner'))).toBeUndefined();
  });

  it('returns 400 for invalid JSON body', async () => {
    const app = makeApp();
    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('JSON');
  });

  it('reflects tool-specific model override over global defaults on GET', async () => {
    persistence.upsertSetting('global', { defaultModel: 'openrouter/global-model' });
    persistence.upsertSetting('deep-research', { model: 'openrouter/tool-model' });
    const app = makeApp();
    const res = await app.request('/api/settings');
    const body = (await res.json()) as {
      global: { defaultModel: string };
      tools: Record<string, { values: { model: string }; inheritedFromGlobal: { model: boolean } }>;
    };
    expect(body.global.defaultModel).toBe('openrouter/global-model');
    expect(body.tools['deep-research'].values.model).toBe('openrouter/tool-model');
    expect(body.tools['deep-research'].inheritedFromGlobal.model).toBe(false);
  });
});
