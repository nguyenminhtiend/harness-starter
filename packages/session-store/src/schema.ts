export const SESSION_STORE_SCHEMA = `
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
