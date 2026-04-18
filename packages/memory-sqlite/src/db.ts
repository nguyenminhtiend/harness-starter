import { Database } from 'bun:sqlite';

export function openDb(path: string): Database {
  const db = new Database(path);
  db.run('PRAGMA journal_mode = WAL');
  return db;
}
