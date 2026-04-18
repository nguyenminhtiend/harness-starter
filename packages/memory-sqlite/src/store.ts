import type { ConversationStore } from '@harness/agent';
import type { Message } from '@harness/core';
import { openDb } from './db.ts';

interface MessageRow {
  role: string;
  content: string;
  cache_boundary: number | null;
}

export interface SqliteStoreResult extends ConversationStore {
  close(): void;
}

export function sqliteStore(opts: { path: string }): SqliteStoreResult {
  const db = openDb(opts.path);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conv_id         TEXT    NOT NULL,
      role            TEXT    NOT NULL,
      content         TEXT    NOT NULL,
      cache_boundary  INTEGER,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_id, id)');

  const loadStmt = db.prepare<MessageRow, [string]>(
    'SELECT role, content, cache_boundary FROM messages WHERE conv_id = ? ORDER BY id',
  );

  const insertStmt = db.prepare(
    'INSERT INTO messages (conv_id, role, content, cache_boundary) VALUES (?, ?, ?, ?)',
  );

  const insertMany = db.transaction((conversationId: string, messages: Message[]) => {
    for (const msg of messages) {
      insertStmt.run(
        conversationId,
        msg.role,
        JSON.stringify(msg.content),
        msg.cacheBoundary ? 1 : null,
      );
    }
  });

  return {
    async load(conversationId: string): Promise<Message[]> {
      const rows = loadStmt.all(conversationId);
      return rows.reduce<Message[]>((acc, row) => {
        try {
          const msg: Message = {
            role: row.role as Message['role'],
            content: JSON.parse(row.content) as Message['content'],
          };
          if (row.cache_boundary === 1) {
            msg.cacheBoundary = true;
          }
          acc.push(msg);
        } catch (e) {
          throw new Error(
            `Corrupt message row in conversation="${conversationId}": ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        return acc;
      }, []);
    },

    async append(conversationId: string, messages: Message[]): Promise<void> {
      insertMany(conversationId, messages);
    },

    close() {
      db.close();
    },
  };
}
