import type { Checkpointer, CheckpointRef, RunState } from '@harness/agent';
import { openDb } from './db.ts';

interface CheckpointRow {
  state: string;
}

interface RefRow {
  run_id: string;
  turn: number;
  created_at: string;
}

export function sqliteCheckpointer(opts: { path: string }): Checkpointer {
  const db = openDb(opts.path);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      run_id      TEXT PRIMARY KEY,
      conv_id     TEXT    NOT NULL,
      turn        INTEGER NOT NULL,
      state       TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_conv ON checkpoints(conv_id, created_at)');

  const upsertStmt = db.prepare(`
    INSERT INTO checkpoints (run_id, conv_id, turn, state)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      turn       = excluded.turn,
      state      = excluded.state,
      updated_at = datetime('now')
  `);

  const loadStmt = db.prepare<CheckpointRow, [string]>(
    'SELECT state FROM checkpoints WHERE run_id = ?',
  );

  const listStmt = db.prepare<RefRow, [string]>(
    'SELECT run_id, turn, created_at FROM checkpoints WHERE conv_id = ? ORDER BY created_at',
  );

  return {
    async save(runId: string, state: RunState): Promise<void> {
      upsertStmt.run(runId, state.conversationId, state.turn, JSON.stringify(state));
    },

    async load(runId: string): Promise<RunState | null> {
      const row = loadStmt.get(runId);
      if (!row) {
        return null;
      }
      try {
        return JSON.parse(row.state) as RunState;
      } catch {
        return null;
      }
    },

    async list(conversationId: string): Promise<CheckpointRef[]> {
      return listStmt.all(conversationId).map((row) => ({
        runId: row.run_id,
        turn: row.turn,
        createdAt: row.created_at,
      }));
    },
  };
}
