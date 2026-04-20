import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SESSION_STORE_SCHEMA } from '@harness/session-store';

const SETTINGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export function createDatabase(dataDir: string): Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'web-studio.db');
  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SETTINGS_SCHEMA);
  db.exec(SESSION_STORE_SCHEMA);
  return db;
}
