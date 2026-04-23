import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fsTool } from './fs.ts';

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mastra-fs-tool-'));
}

describe('fsTool', () => {
  test('read returns content for an existing file', async () => {
    const ws = await makeWorkspace();
    const f = path.join(ws, 'a.txt');
    await writeFile(f, 'hello', 'utf8');
    const tool = fsTool({ workspace: ws });
    const out = await tool.execute({ operation: 'read', path: 'a.txt' }, {});
    expect(out).toBe('hello');
    await rm(ws, { recursive: true, force: true });
  });

  test('read missing file throws', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws });
    await expect(tool.execute({ operation: 'read', path: 'nope.txt' }, {})).rejects.toThrow(
      'not accessible',
    );
    await rm(ws, { recursive: true, force: true });
  });

  test('write then read round-trip in rw mode', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws, mode: 'rw' });
    await tool.execute({ operation: 'write', path: 'sub/out.txt', content: 'round' }, {});
    const out = await tool.execute({ operation: 'read', path: 'sub/out.txt' }, {});
    expect(out).toBe('round');
    await rm(ws, { recursive: true, force: true });
  });

  test('write in ro mode is rejected by schema validation', async () => {
    const tool = fsTool({ workspace: '/tmp', mode: 'ro' });
    const result = await tool.execute({ operation: 'write', path: 'x', content: 'y' }, {});
    expect(result).toHaveProperty('error', true);
  });

  test('list returns directory entries', async () => {
    const ws = await makeWorkspace();
    await mkdir(path.join(ws, 'd'), { recursive: true });
    await writeFile(path.join(ws, 'd', 'f.txt'), '', 'utf8');
    const tool = fsTool({ workspace: ws });
    const raw = await tool.execute({ operation: 'list', path: 'd' }, {});
    const parsed = JSON.parse(raw as string) as {
      entries: { name: string; type: string }[];
      truncated: boolean;
    };
    expect(parsed.entries).toEqual([{ name: 'f.txt', type: 'file' }]);
    expect(parsed.truncated).toBe(false);
    await rm(ws, { recursive: true, force: true });
  });

  test('../ traversal throws', async () => {
    const ws = await makeWorkspace();
    const outside = await makeWorkspace();
    await writeFile(path.join(outside, 'secret.txt'), 'x', 'utf8');
    const rel = path.relative(ws, path.join(outside, 'secret.txt'));
    const tool = fsTool({ workspace: ws });
    await expect(tool.execute({ operation: 'read', path: rel }, {})).rejects.toThrow(
      'escapes workspace',
    );
    await rm(ws, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test('absolute path outside workspace throws', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws });
    await expect(tool.execute({ operation: 'read', path: '/etc/passwd' }, {})).rejects.toThrow(
      'escapes workspace',
    );
    await rm(ws, { recursive: true, force: true });
  });

  test('symlink pointing outside workspace throws', async () => {
    const ws = await makeWorkspace();
    const outside = await makeWorkspace();
    const secret = path.join(outside, 'secret.txt');
    await writeFile(secret, 'leak', 'utf8');
    await symlink(secret, path.join(ws, 'link.txt'));
    const tool = fsTool({ workspace: ws });
    await expect(tool.execute({ operation: 'read', path: 'link.txt' }, {})).rejects.toThrow(
      'escapes workspace',
    );
    await rm(ws, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test('write creates intermediate directories', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws, mode: 'rw' });
    await tool.execute({ operation: 'write', path: 'a/b/c/d.txt', content: 'deep' }, {});
    const disk = await readFile(path.join(ws, 'a/b/c/d.txt'), 'utf8');
    expect(disk).toBe('deep');
    await rm(ws, { recursive: true, force: true });
  });
});
