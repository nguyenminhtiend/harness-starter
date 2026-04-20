import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RunStatus, UIEvent } from '../shared/events.ts';

export interface RunRow {
  id: string;
  toolId: string;
  question: string;
  status: RunStatus;
  costUsd?: number;
  totalTokens?: number;
  createdAt: string;
  finishedAt?: string;
}

export interface CreateRunInput {
  id: string;
  toolId: string;
  question: string;
  status: RunStatus;
}

export interface UpdateRunInput {
  status?: RunStatus;
  costUsd?: number;
  totalTokens?: number;
  finishedAt?: string;
}

export interface ListRunsFilter {
  status?: RunStatus;
  q?: string;
  limit?: number;
}

export interface StoredEvent {
  seq: number;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface Persistence {
  upsertSetting(key: string, value: unknown): void;
  deleteSetting(key: string): void;
  getSetting<T = unknown>(key: string): T | undefined;
  getAllSettings(): Record<string, unknown>;

  createRun(input: CreateRunInput): void;
  updateRun(id: string, patch: UpdateRunInput): void;
  getRun(id: string): RunRow | undefined;
  listRuns(filter?: ListRunsFilter): RunRow[];

  appendEvent(runId: string, event: UIEvent): void;
  getEvents(runId: string): StoredEvent[];

  close(): void;
}

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

export function createPersistence(dataDir: string): Persistence {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'web-studio.db');
  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const stmts = {
    upsertSetting: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2',
    ),
    deleteSetting: db.prepare('DELETE FROM settings WHERE key = ?'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    getAllSettings: db.prepare('SELECT key, value FROM settings'),

    createRun: db.prepare(
      'INSERT INTO runs (id, toolId, question, status) VALUES ($id, $toolId, $question, $status)',
    ),
    getRun: db.prepare('SELECT * FROM runs WHERE id = ?'),

    appendEvent: db.prepare(
      `INSERT INTO events (runId, seq, ts, type, payload)
       VALUES ($runId, (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE runId = $runId), $ts, $type, $payload)`,
    ),
    getEvents: db.prepare('SELECT seq, ts, type, payload FROM events WHERE runId = ? ORDER BY seq'),
  };

  return {
    upsertSetting(key, value) {
      stmts.upsertSetting.run(key, JSON.stringify(value));
    },

    deleteSetting(key) {
      stmts.deleteSetting.run(key);
    },

    getSetting<T = unknown>(key: string): T | undefined {
      const row = stmts.getSetting.get(key) as { value: string } | null;
      if (!row) {
        return undefined;
      }
      return JSON.parse(row.value) as T;
    },

    getAllSettings() {
      const rows = stmts.getAllSettings.all() as { key: string; value: string }[];
      const result: Record<string, unknown> = {};
      for (const row of rows) {
        result[row.key] = JSON.parse(row.value);
      }
      return result;
    },

    createRun(input) {
      stmts.createRun.run({
        $id: input.id,
        $toolId: input.toolId,
        $question: input.question,
        $status: input.status,
      });
    },

    updateRun(id, patch) {
      const sets: string[] = [];
      const params: Record<string, string | number | null> = { $id: id };
      if (patch.status !== undefined) {
        sets.push('status = $status');
        params.$status = patch.status;
      }
      if (patch.costUsd !== undefined) {
        sets.push('costUsd = $costUsd');
        params.$costUsd = patch.costUsd;
      }
      if (patch.totalTokens !== undefined) {
        sets.push('totalTokens = $totalTokens');
        params.$totalTokens = patch.totalTokens;
      }
      if (patch.finishedAt !== undefined) {
        sets.push('finishedAt = $finishedAt');
        params.$finishedAt = patch.finishedAt;
      }
      if (sets.length === 0) {
        return;
      }
      db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = $id`).run(params);
    },

    getRun(id) {
      const row = stmts.getRun.get(id) as RunRow | null;
      return row ?? undefined;
    },

    listRuns(filter) {
      const wheres: string[] = [];
      const params: Record<string, string | number> = {};

      if (filter?.status) {
        wheres.push('status = $status');
        params.$status = filter.status;
      }
      if (filter?.q) {
        wheres.push('question LIKE $q');
        params.$q = `%${filter.q}%`;
      }

      const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
      const limit = filter?.limit ? `LIMIT ${filter.limit}` : '';
      const sql = `SELECT * FROM runs ${where} ORDER BY createdAt DESC, rowid DESC ${limit}`;
      return db.prepare(sql).all(params) as RunRow[];
    },

    appendEvent(runId, event) {
      const { type, ts, ...rest } = event;
      stmts.appendEvent.run({
        $runId: runId,
        $ts: ts,
        $type: type,
        $payload: JSON.stringify(rest),
      });
    },

    getEvents(runId) {
      const rows = stmts.getEvents.all(runId) as {
        seq: number;
        ts: number;
        type: string;
        payload: string;
      }[];
      return rows.map((r) => ({
        seq: r.seq,
        ts: r.ts,
        type: r.type,
        payload: JSON.parse(r.payload) as Record<string, unknown>,
      }));
    },

    close() {
      db.close();
    },
  };
}
