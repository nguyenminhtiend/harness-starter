import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../index.ts';
import { createPersistence, type Persistence } from '../persistence.ts';

let persistence: Persistence;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-tools-route-'));
  persistence = createPersistence(tmpDir);
});

afterEach(() => {
  persistence.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/tools', () => {
  it('returns each tool with id, title, description, and JSON Schema', async () => {
    const app = createApp({ persistence, getApiKey: () => 'k' });
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
