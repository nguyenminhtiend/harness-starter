import { describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LibSQLStore } from '@mastra/libsql';
import { createMastraStorage, defaultRepoDbUrl } from './storage.ts';

describe('defaultRepoDbUrl', () => {
  test('returns file: URL pointing to .mastra/mastra.db under finder result', () => {
    const url = defaultRepoDbUrl(() => '/fake/root');
    expect(url).toBe(`file:${join('/fake/root', '.mastra', 'mastra.db')}`);
  });

  test('throws when finder cannot locate repo root', () => {
    expect(() => defaultRepoDbUrl(() => undefined)).toThrow('Could not resolve repo root');
  });
});

describe('createMastraStorage', () => {
  test('returns a LibSQLStore instance', () => {
    const store = createMastraStorage({ url: 'file::memory:' });
    expect(store).toBeInstanceOf(LibSQLStore);
  });

  test('explicit url arg takes precedence over env and default', () => {
    const prev = process.env.MASTRA_DB_URL;
    process.env.MASTRA_DB_URL = 'file::memory:?should-not-be-used';
    try {
      const store = createMastraStorage({ url: 'file::memory:' });
      expect(store).toBeInstanceOf(LibSQLStore);
    } finally {
      if (prev === undefined) {
        delete process.env.MASTRA_DB_URL;
      } else {
        process.env.MASTRA_DB_URL = prev;
      }
    }
  });

  test('env MASTRA_DB_URL is used when no url arg', () => {
    const prev = process.env.MASTRA_DB_URL;
    process.env.MASTRA_DB_URL = 'file::memory:';
    try {
      const store = createMastraStorage();
      expect(store).toBeInstanceOf(LibSQLStore);
    } finally {
      if (prev === undefined) {
        delete process.env.MASTRA_DB_URL;
      } else {
        process.env.MASTRA_DB_URL = prev;
      }
    }
  });

  test('falls back to finder when no url arg or env', () => {
    const tmpRoot = `/tmp/harness-storage-test-${Date.now()}`;
    mkdirSync(join(tmpRoot, '.mastra'), { recursive: true });
    let finderStartDir = '';
    const finder = (startDir: string) => {
      finderStartDir = startDir;
      return tmpRoot;
    };
    const prev = process.env.MASTRA_DB_URL;
    delete process.env.MASTRA_DB_URL;
    try {
      const store = createMastraStorage({ _repoFinder: finder });
      expect(store).toBeInstanceOf(LibSQLStore);
      expect(finderStartDir).toBeTruthy();
    } finally {
      if (prev !== undefined) {
        process.env.MASTRA_DB_URL = prev;
      }
    }
  });
});
