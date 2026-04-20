import type { Database } from 'bun:sqlite';

export interface SettingsStore {
  upsert(key: string, value: unknown): void;
  delete(key: string): void;
  get<T = unknown>(key: string): T | undefined;
  getAll(): Record<string, unknown>;
}

export function createSettingsStore(db: Database): SettingsStore {
  const stmts = {
    upsert: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2',
    ),
    delete: db.prepare('DELETE FROM settings WHERE key = ?'),
    get: db.prepare('SELECT value FROM settings WHERE key = ?'),
    getAll: db.prepare('SELECT key, value FROM settings'),
  };

  return {
    upsert(key, value) {
      stmts.upsert.run(key, JSON.stringify(value));
    },

    delete(key) {
      stmts.delete.run(key);
    },

    get<T = unknown>(key: string): T | undefined {
      const row = stmts.get.get(key) as { value: string } | null;
      if (!row) {
        return undefined;
      }
      return JSON.parse(row.value) as T;
    },

    getAll() {
      const rows = stmts.getAll.all() as { key: string; value: string }[];
      const result: Record<string, unknown> = {};
      for (const row of rows) {
        result[row.key] = JSON.parse(row.value);
      }
      return result;
    },
  };
}
