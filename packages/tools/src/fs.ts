import type { Dirent, Stats } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Tool, ToolContext } from '@harness/agent';
import { tool } from '@harness/agent';
import { assertNotAborted, ToolError } from '@harness/core';
import { z } from 'zod';

const MAX_READ_BYTES = 1024 * 1024;
const MAX_LIST_ENTRIES = 10_000;

const readOp = z.object({
  operation: z.literal('read'),
  path: z.string(),
});

const writeOp = z.object({
  operation: z.literal('write'),
  path: z.string(),
  content: z.string(),
});

const listOp = z.object({
  operation: z.literal('list'),
  path: z.string(),
});

function fsParams(mode: 'ro' | 'rw') {
  if (mode === 'rw') {
    return z.discriminatedUnion('operation', [readOp, writeOp, listOp]);
  }
  return z.discriminatedUnion('operation', [readOp, listOp]);
}

function isInsideRoot(rootReal: string, resolvedPath: string): boolean {
  const rel = path.relative(rootReal, resolvedPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function throwFs(message: string, cause?: unknown): never {
  throw new ToolError(message, { toolName: 'fs', cause });
}

async function workspaceRealpath(workspaceResolved: string): Promise<string> {
  try {
    return await realpath(workspaceResolved);
  } catch (e) {
    throwFs('Workspace path is not accessible', e);
  }
}

async function resolveExistingInWorkspace(
  workspaceResolved: string,
  workspaceReal: string,
  userPath: string,
): Promise<string> {
  const candidate = path.resolve(workspaceResolved, userPath);
  let realCandidate: string;
  try {
    realCandidate = await realpath(candidate);
  } catch (e) {
    throwFs('Path does not exist or is not accessible', e);
  }
  if (!isInsideRoot(workspaceReal, realCandidate)) {
    throwFs('Path escapes workspace');
  }
  return realCandidate;
}

async function assertWritePathAllowed(
  workspaceResolved: string,
  workspaceReal: string,
  userPath: string,
): Promise<string> {
  const targetResolved = path.resolve(workspaceResolved, userPath);
  if (!isInsideRoot(workspaceResolved, targetResolved)) {
    throwFs('Path escapes workspace');
  }
  const dir = path.dirname(targetResolved);
  const relToWs = path.relative(workspaceResolved, dir);
  if (relToWs.startsWith('..') || path.isAbsolute(relToWs)) {
    throwFs('Path escapes workspace');
  }
  const segments = relToWs.length === 0 ? [] : relToWs.split(path.sep);
  let current = workspaceResolved;
  for (const seg of segments) {
    if (!seg) {
      continue;
    }
    current = path.join(current, seg);
    try {
      await stat(current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throwFs('Failed to stat path', e);
    }
    let rp: string;
    try {
      rp = await realpath(current);
    } catch (e) {
      throwFs('Failed to resolve path', e);
    }
    if (!isInsideRoot(workspaceReal, rp)) {
      throwFs('Path escapes workspace');
    }
  }
  return targetResolved;
}

export function fsTool(opts: { workspace: string; mode?: 'ro' | 'rw' }): Tool {
  const mode = opts.mode ?? 'ro';
  const parameters = fsParams(mode);

  return tool({
    name: 'fs',
    description:
      mode === 'rw'
        ? 'Read, write, or list files under the workspace directory.'
        : 'Read or list files under the workspace directory (read-only).',
    parameters,
    async execute(
      args: z.infer<typeof parameters>,
      ctx: ToolContext,
    ): Promise<string | { ok: true }> {
      assertNotAborted(ctx.signal);

      const workspaceResolved = path.resolve(opts.workspace);
      const workspaceReal = await workspaceRealpath(workspaceResolved);

      if (args.operation === 'read') {
        assertNotAborted(ctx.signal);
        const realPath = await resolveExistingInWorkspace(
          workspaceResolved,
          workspaceReal,
          args.path,
        );
        let st: Stats;
        try {
          st = await stat(realPath);
        } catch (e) {
          throwFs('Failed to stat path', e);
        }
        if (!st.isFile()) {
          throwFs('Path is not a file');
        }
        if (st.size > MAX_READ_BYTES) {
          throwFs(`File exceeds maximum read size of ${MAX_READ_BYTES} bytes`);
        }
        // Note: TOCTOU gap — file may grow between stat and read. The size
        // check is best-effort; a concurrent writer could exceed MAX_READ_BYTES.
        assertNotAborted(ctx.signal);
        try {
          return await readFile(realPath, 'utf8');
        } catch (e) {
          throwFs('Failed to read file', e);
        }
      }

      if (args.operation === 'list') {
        assertNotAborted(ctx.signal);
        const realPath = await resolveExistingInWorkspace(
          workspaceResolved,
          workspaceReal,
          args.path,
        );
        let st: Stats;
        try {
          st = await stat(realPath);
        } catch (e) {
          throwFs('Failed to stat path', e);
        }
        if (!st.isDirectory()) {
          throwFs('Path is not a directory');
        }
        assertNotAborted(ctx.signal);
        let dents: Dirent[];
        try {
          dents = await readdir(realPath, { withFileTypes: true });
        } catch (e) {
          throwFs('Failed to list directory', e);
        }
        const truncated = dents.length > MAX_LIST_ENTRIES;
        const limited = truncated ? dents.slice(0, MAX_LIST_ENTRIES) : dents;
        const entries: { name: string; type: 'file' | 'directory' | 'symlink' | 'other' }[] =
          limited.map((d) => ({
            name: d.name,
            type: d.isDirectory()
              ? 'directory'
              : d.isFile()
                ? 'file'
                : d.isSymbolicLink()
                  ? 'symlink'
                  : 'other',
          }));
        return JSON.stringify({ entries, truncated, total: dents.length });
      }

      if (mode === 'rw' && args.operation === 'write') {
        assertNotAborted(ctx.signal);
        const targetResolved = await assertWritePathAllowed(
          workspaceResolved,
          workspaceReal,
          args.path,
        );
        const parent = path.dirname(targetResolved);
        assertNotAborted(ctx.signal);
        try {
          await mkdir(parent, { recursive: true });
        } catch (e) {
          throwFs('Failed to create parent directories', e);
        }
        assertNotAborted(ctx.signal);
        try {
          await writeFile(targetResolved, args.content, 'utf8');
        } catch (e) {
          throwFs('Failed to write file', e);
        }
        return { ok: true };
      }

      throwFs('Unsupported operation');
    },
  }) as Tool;
}
