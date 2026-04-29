import { describe, expect, it } from 'bun:test';
import { LibSQLVector } from '@mastra/libsql';
import { defaultRepoDbUrl } from './storage.ts';
import { createMastraVector } from './vector.ts';

describe('createMastraVector', () => {
  it('returns a LibSQLVector instance', () => {
    const vector = createMastraVector({ url: 'file::memory:' });
    expect(vector).toBeInstanceOf(LibSQLVector);
  });

  it('uses MASTRA_DB_URL env var when set', () => {
    const original = process.env.MASTRA_DB_URL;
    try {
      process.env.MASTRA_DB_URL = 'file::memory:';
      const vector = createMastraVector();
      expect(vector).toBeInstanceOf(LibSQLVector);
    } finally {
      if (original === undefined) {
        delete process.env.MASTRA_DB_URL;
      } else {
        process.env.MASTRA_DB_URL = original;
      }
    }
  });

  it('mirrors defaultRepoDbUrl resolution from storage helper', () => {
    const dbUrl = defaultRepoDbUrl();
    expect(dbUrl).toMatch(/^file:.*\.mastra\/mastra\.db$/);
  });
});
