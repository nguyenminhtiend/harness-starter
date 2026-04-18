import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ToolError } from '@harness/core';
import { z } from 'zod';
import { fsTool } from './fs.ts';

async function makeWorkspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'harness-fs-tool-'));
}

describe('fsTool', () => {
  test('read returns content for an existing file', async () => {
    const ws = await makeWorkspace();
    const f = path.join(ws, 'a.txt');
    await writeFile(f, 'hello', 'utf8');
    const tool = fsTool({ workspace: ws });
    const out = await tool.execute(
      { operation: 'read', path: 'a.txt' },
      {
        runId: 'r1',
        conversationId: 'c1',
        signal: new AbortController().signal,
      },
    );
    expect(out).toBe('hello');
    await rm(ws, { recursive: true, force: true });
  });

  test('read missing file throws ToolError', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws });
    await expect(
      tool.execute(
        { operation: 'read', path: 'nope.txt' },
        {
          runId: 'r1',
          conversationId: 'c1',
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow(ToolError);
    await rm(ws, { recursive: true, force: true });
  });

  test('write then read round-trip in rw mode', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws, mode: 'rw' });
    await tool.execute(
      { operation: 'write', path: 'sub/out.txt', content: 'round' },
      {
        runId: 'r1',
        conversationId: 'c1',
        signal: new AbortController().signal,
      },
    );
    const out = await tool.execute(
      { operation: 'read', path: 'sub/out.txt' },
      {
        runId: 'r1',
        conversationId: 'c1',
        signal: new AbortController().signal,
      },
    );
    expect(out).toBe('round');
    await rm(ws, { recursive: true, force: true });
  });

  test('write in ro mode is rejected by Zod schema', () => {
    const tool = fsTool({ workspace: '/tmp', mode: 'ro' });
    const r = tool.parameters.safeParse({
      operation: 'write',
      path: 'x',
      content: 'y',
    });
    expect(r.success).toBe(false);
  });

  test('list returns directory entries as JSON string', async () => {
    const ws = await makeWorkspace();
    await mkdir(path.join(ws, 'd'), { recursive: true });
    await writeFile(path.join(ws, 'd', 'f.txt'), '', 'utf8');
    const tool = fsTool({ workspace: ws });
    const raw = await tool.execute(
      { operation: 'list', path: 'd' },
      {
        runId: 'r1',
        conversationId: 'c1',
        signal: new AbortController().signal,
      },
    );
    expect(typeof raw).toBe('string');
    const parsed = z
      .object({
        entries: z.array(
          z.object({
            name: z.string(),
            type: z.enum(['file', 'directory', 'symlink', 'other']),
          }),
        ),
        truncated: z.boolean(),
        total: z.number(),
      })
      .parse(JSON.parse(raw as string));
    parsed.entries.sort((a, b) => a.name.localeCompare(b.name));
    expect(parsed.entries).toEqual([{ name: 'f.txt', type: 'file' }]);
    expect(parsed.truncated).toBe(false);
    await rm(ws, { recursive: true, force: true });
  });

  test('../ traversal throws ToolError', async () => {
    const ws = await makeWorkspace();
    const outside = await makeWorkspace();
    await writeFile(path.join(outside, 'secret.txt'), 'x', 'utf8');
    const rel = path.relative(ws, path.join(outside, 'secret.txt'));
    const tool = fsTool({ workspace: ws });
    await expect(
      tool.execute(
        { operation: 'read', path: rel },
        {
          runId: 'r1',
          conversationId: 'c1',
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow(ToolError);
    await rm(ws, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test('absolute path outside workspace throws ToolError', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws });
    await expect(
      tool.execute(
        { operation: 'read', path: '/etc/passwd' },
        {
          runId: 'r1',
          conversationId: 'c1',
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow(ToolError);
    await rm(ws, { recursive: true, force: true });
  });

  test('symlink pointing outside workspace throws ToolError on read', async () => {
    const ws = await makeWorkspace();
    const outside = await makeWorkspace();
    const secret = path.join(outside, 'secret.txt');
    await writeFile(secret, 'leak', 'utf8');
    const linkPath = path.join(ws, 'link.txt');
    await symlink(secret, linkPath);
    const tool = fsTool({ workspace: ws });
    await expect(
      tool.execute(
        { operation: 'read', path: 'link.txt' },
        {
          runId: 'r1',
          conversationId: 'c1',
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow(ToolError);
    await rm(ws, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test('aborted signal throws before work', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws });
    const ac = new AbortController();
    ac.abort();
    await expect(
      tool.execute(
        { operation: 'read', path: 'any' },
        {
          runId: 'r1',
          conversationId: 'c1',
          signal: ac.signal,
        },
      ),
    ).rejects.toThrow();
    await rm(ws, { recursive: true, force: true });
  });

  test('write creates intermediate directories', async () => {
    const ws = await makeWorkspace();
    const tool = fsTool({ workspace: ws, mode: 'rw' });
    await tool.execute(
      { operation: 'write', path: 'a/b/c/d.txt', content: 'deep' },
      {
        runId: 'r1',
        conversationId: 'c1',
        signal: new AbortController().signal,
      },
    );
    const disk = await readFile(path.join(ws, 'a/b/c/d.txt'), 'utf8');
    expect(disk).toBe('deep');
    await rm(ws, { recursive: true, force: true });
  });
});
