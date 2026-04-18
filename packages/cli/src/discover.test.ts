import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationError } from '@harness/core';
import { discoverEvalFiles } from './discover.ts';

const fixtureDir = join(tmpdir(), `harness-cli-discover-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(join(fixtureDir, 'packages', 'agent', 'src'), { recursive: true });
  mkdirSync(join(fixtureDir, 'packages', 'core', 'src'), { recursive: true });
  mkdirSync(join(fixtureDir, 'node_modules', 'fake'), { recursive: true });

  writeFileSync(join(fixtureDir, 'packages', 'agent', 'src', 'chat.eval.ts'), '');
  writeFileSync(join(fixtureDir, 'packages', 'agent', 'src', 'tool.eval.ts'), '');
  writeFileSync(join(fixtureDir, 'packages', 'core', 'src', 'retry.eval.ts'), '');
  writeFileSync(join(fixtureDir, 'packages', 'core', 'src', 'retry.test.ts'), '');
  writeFileSync(join(fixtureDir, 'node_modules', 'fake', 'bad.eval.ts'), '');
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('discoverEvalFiles', () => {
  it('finds all .eval.ts files recursively', async () => {
    const files = await discoverEvalFiles('**/*.eval.ts', fixtureDir);
    expect(files).toHaveLength(3);
    expect(files.every((f) => f.endsWith('.eval.ts'))).toBe(true);
  });

  it('returns sorted absolute paths', async () => {
    const files = await discoverEvalFiles('**/*.eval.ts', fixtureDir);
    for (const f of files) {
      expect(f).toMatch(/^\//);
    }
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  it('respects scoped patterns', async () => {
    const files = await discoverEvalFiles('packages/agent/**/*.eval.ts', fixtureDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.includes('agent'))).toBe(true);
  });

  it('ignores node_modules', async () => {
    const files = await discoverEvalFiles('**/*.eval.ts', fixtureDir);
    expect(files.every((f) => !f.includes('node_modules'))).toBe(true);
  });

  it('does not match .test.ts files', async () => {
    const files = await discoverEvalFiles('**/*.eval.ts', fixtureDir);
    expect(files.every((f) => !f.endsWith('.test.ts'))).toBe(true);
  });

  it('throws ValidationError when no files match', async () => {
    await expect(discoverEvalFiles('nonexistent/**/*.eval.ts', fixtureDir)).rejects.toThrow(
      ValidationError,
    );
  });
});
