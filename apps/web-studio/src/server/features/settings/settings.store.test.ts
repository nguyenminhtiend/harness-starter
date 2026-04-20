import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createDatabase } from '../../infra/db.ts';
import { createSettingsStore, type SettingsStore } from './settings.store.ts';

let db: Database;
let store: SettingsStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-settingsstore-'));
  db = createDatabase(tmpDir);
  store = createSettingsStore(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('settings store', () => {
  it('returns undefined for missing key', () => {
    expect(store.get('missing')).toBeUndefined();
  });

  it('upserts and gets a setting', () => {
    store.upsert('model', 'openrouter/free');
    expect(store.get('model')).toBe('openrouter/free');
  });

  it('overwrites on second upsert', () => {
    store.upsert('model', 'openrouter/free');
    store.upsert('model', 'openrouter/free');
    expect(store.get('model')).toBe('openrouter/free');
  });

  it('stores and retrieves JSON objects', () => {
    const obj = { a: 1, b: [2, 3] };
    store.upsert('complex', obj);
    expect(store.get('complex')).toEqual(obj);
  });

  it('gets all settings', () => {
    store.upsert('a', 1);
    store.upsert('b', 'two');
    const all = store.getAll();
    expect(all).toEqual({ a: 1, b: 'two' });
  });

  it('delete removes a key', () => {
    store.upsert('temp', 'gone');
    expect(store.get('temp')).toBe('gone');
    store.delete('temp');
    expect(store.get('temp')).toBeUndefined();
  });
});

describe('schema auto-creation', () => {
  it('creates DB file at the expected path', () => {
    const dbPath = path.join(tmpDir, 'web-studio.db');
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
