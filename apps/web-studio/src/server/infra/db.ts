import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id          TEXT PRIMARY KEY,
    toolId      TEXT NOT NULL,
    question    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    costUsd     REAL,
    totalTokens INTEGER,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
    finishedAt  TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    runId   TEXT NOT NULL,
    seq     INTEGER NOT NULL,
    ts      REAL NOT NULL,
    type    TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (runId, seq)
  );
`;

export function createDatabase(dataDir: string): Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'web-studio.db');
  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
