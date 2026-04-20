import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApprovalStore, createHitlSessionStore } from '@harness/hitl';
import { createSessionStore } from '@harness/session-store';
import { createApp } from '../../index.ts';
import { createDatabase } from '../../infra/db.ts';
import { createSettingsStore } from '../settings/settings.store.ts';

let db: Database;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-tools-route-'));
  db = createDatabase(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/tools', () => {
  it('returns each tool with id, title, description, and JSON Schema', async () => {
    const app = createApp({
      sessionStore: createSessionStore(db),
      settingsStore: createSettingsStore(db),
      getProviderKeys: () => ({ google: 'k', openrouter: 'k' }),
      approvalStore: createApprovalStore(),
      hitlSessionStore: createHitlSessionStore(),
    });
    const res = await app.request('/api/tools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tools: {
        id: string;
        title: string;
        description: string;
        settingsSchema: Record<string, unknown>;
      }[];
    };
    expect(body.tools.length).toBeGreaterThanOrEqual(1);
    for (const t of body.tools) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.title).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.settingsSchema).toBe('object');
    }
    const dr = body.tools.find((t) => t.id === 'deep-research');
    expect(dr).toBeDefined();
    if (dr) {
      expect(dr.settingsSchema.type).toBe('object');
    }
  });
});
