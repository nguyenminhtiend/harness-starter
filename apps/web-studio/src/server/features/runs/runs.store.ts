import type { Database } from 'bun:sqlite';
import type { UIEvent } from '../../../shared/events.ts';
import type {
  CreateRunInput,
  ListRunsFilter,
  RunRow,
  StoredEvent,
  UpdateRunInput,
} from './runs.types.ts';

export interface RunStore {
  createRun(input: CreateRunInput): void;
  updateRun(id: string, patch: UpdateRunInput): void;
  getRun(id: string): RunRow | undefined;
  listRuns(filter?: ListRunsFilter): RunRow[];
  deleteRun(id: string): void;
  appendEvent(runId: string, event: UIEvent): void;
  getEvents(runId: string): StoredEvent[];
}

export function createRunStore(db: Database): RunStore {
  const stmts = {
    createRun: db.prepare(
      'INSERT INTO runs (id, toolId, question, status) VALUES ($id, $toolId, $question, $status)',
    ),
    getRun: db.prepare('SELECT * FROM runs WHERE id = ?'),
    appendEvent: db.prepare(
      `INSERT INTO events (runId, seq, ts, type, payload)
       VALUES ($runId, $seq, $ts, $type, $payload)`,
    ),
    getEvents: db.prepare('SELECT seq, ts, type, payload FROM events WHERE runId = ? ORDER BY seq'),
  };

  const seqCounters = new Map<string, number>();

  function nextSeq(runId: string): number {
    let seq = seqCounters.get(runId);
    if (seq === undefined) {
      const row = db
        .prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM events WHERE runId = ?')
        .get(runId) as { maxSeq: number } | null;
      seq = row?.maxSeq ?? 0;
    }
    seq += 1;
    seqCounters.set(runId, seq);
    return seq;
  }

  return {
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
      const safeLimit = filter?.limit
        ? Math.max(1, Math.min(500, Math.round(filter.limit)))
        : undefined;
      const limitClause = safeLimit !== undefined ? `LIMIT ${safeLimit}` : '';
      const sql = `SELECT * FROM runs ${where} ORDER BY createdAt DESC, rowid DESC ${limitClause}`;
      return db.prepare(sql).all(params) as RunRow[];
    },

    deleteRun(id) {
      db.prepare('DELETE FROM events WHERE runId = ?').run(id);
      db.prepare('DELETE FROM runs WHERE id = ?').run(id);
      seqCounters.delete(id);
    },

    appendEvent(runId, event) {
      const { type, ts, ...rest } = event;
      stmts.appendEvent.run({
        $runId: runId,
        $seq: nextSeq(runId),
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
  };
}
