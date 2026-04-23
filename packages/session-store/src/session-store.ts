import type { Database } from 'bun:sqlite';
import type {
  CreateSessionInput,
  EventInput,
  ListSessionsFilter,
  SessionRow,
  StoredEvent,
  UpdateSessionInput,
} from './types.ts';

export interface ConversationSummary {
  conversationId: string;
  toolId: string;
  firstQuestion: string;
  messageCount: number;
  lastActivityAt: string;
}

export interface SessionStore {
  createSession(input: CreateSessionInput): void;
  updateSession(id: string, patch: UpdateSessionInput): void;
  getSession(id: string): SessionRow | undefined;
  listSessions(filter?: ListSessionsFilter): SessionRow[];
  deleteSession(id: string): void;
  appendEvent<T extends EventInput>(sessionId: string, event: T): void;
  getEvents(sessionId: string): StoredEvent[];
  listConversations(toolId?: string): ConversationSummary[];
  getSessionsByConversation(conversationId: string): SessionRow[];
  deleteConversation(conversationId: string): void;
}

export function createSessionStore(db: Database): SessionStore {
  const stmts = {
    create: db.prepare(
      'INSERT INTO runs (id, toolId, question, status, conversationId) VALUES ($id, $toolId, $question, $status, $conversationId)',
    ),
    get: db.prepare('SELECT * FROM runs WHERE id = ?'),
    appendEvent: db.prepare(
      `INSERT INTO events (runId, seq, ts, type, payload)
       VALUES ($runId, $seq, $ts, $type, $payload)`,
    ),
    getEvents: db.prepare('SELECT seq, ts, type, payload FROM events WHERE runId = ? ORDER BY seq'),
  };

  const seqCounters = new Map<string, number>();

  function nextSeq(sessionId: string): number {
    let seq = seqCounters.get(sessionId);
    if (seq === undefined) {
      const row = db
        .prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM events WHERE runId = ?')
        .get(sessionId) as { maxSeq: number } | null;
      seq = row?.maxSeq ?? 0;
    }
    seq += 1;
    seqCounters.set(sessionId, seq);
    return seq;
  }

  return {
    createSession(input) {
      stmts.create.run({
        $id: input.id,
        $toolId: input.toolId,
        $question: input.question,
        $status: input.status,
        $conversationId: input.conversationId ?? null,
      });
    },

    updateSession(id, patch) {
      const sets: string[] = [];
      const params: Record<string, string | number | null> = { $id: id };
      if (patch.status !== undefined) {
        sets.push('status = $status');
        params.$status = patch.status;
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

    getSession(id) {
      const row = stmts.get.get(id) as SessionRow | null;
      return row ?? undefined;
    },

    listSessions(filter) {
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
      const limitClause = safeLimit !== undefined ? 'LIMIT $limit' : '';
      if (safeLimit !== undefined) {
        params.$limit = safeLimit;
      }
      const sql = `SELECT * FROM runs ${where} ORDER BY createdAt DESC, rowid DESC ${limitClause}`;
      return db.prepare(sql).all(params) as SessionRow[];
    },

    deleteSession(id) {
      db.prepare('DELETE FROM events WHERE runId = ?').run(id);
      db.prepare('DELETE FROM runs WHERE id = ?').run(id);
      seqCounters.delete(id);
    },

    appendEvent(sessionId, event) {
      const { type, ts, ...rest } = event;
      stmts.appendEvent.run({
        $runId: sessionId,
        $seq: nextSeq(sessionId),
        $ts: ts,
        $type: type,
        $payload: JSON.stringify(rest),
      });
    },

    getEvents(sessionId) {
      const rows = stmts.getEvents.all(sessionId) as {
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

    listConversations(toolId) {
      const where = toolId
        ? 'WHERE conversationId IS NOT NULL AND toolId = $toolId'
        : 'WHERE conversationId IS NOT NULL';
      const params: Record<string, string> = {};
      if (toolId) {
        params.$toolId = toolId;
      }
      const sql = `
        SELECT
          r.conversationId,
          r.toolId,
          (SELECT question FROM runs r2 WHERE r2.conversationId = r.conversationId ORDER BY r2.createdAt ASC LIMIT 1) AS firstQuestion,
          COUNT(*) AS messageCount,
          MAX(r.createdAt) AS lastActivityAt
        FROM runs r
        ${where.replace('conversationId', 'r.conversationId').replace('toolId', 'r.toolId')}
        GROUP BY r.conversationId
        ORDER BY lastActivityAt DESC
      `;
      return db.prepare(sql).all(params) as ConversationSummary[];
    },

    getSessionsByConversation(conversationId) {
      return db
        .prepare('SELECT * FROM runs WHERE conversationId = ? ORDER BY createdAt ASC')
        .all(conversationId) as SessionRow[];
    },

    deleteConversation(conversationId) {
      const sessions = db
        .prepare('SELECT id FROM runs WHERE conversationId = ?')
        .all(conversationId) as { id: string }[];
      for (const s of sessions) {
        db.prepare('DELETE FROM events WHERE runId = ?').run(s.id);
        seqCounters.delete(s.id);
      }
      db.prepare('DELETE FROM runs WHERE conversationId = ?').run(conversationId);
    },
  };
}
