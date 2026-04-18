import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EventBus } from '@harness/core';
import { createEventBus, ToolError } from '@harness/core';
import { jsonlSink } from './jsonl-sink.ts';

let bus: EventBus;
let tempDir: string;
let logPath: string;

beforeEach(async () => {
  bus = createEventBus();
  tempDir = await mkdtemp(join(tmpdir(), 'obs-jsonl-'));
  logPath = join(tempDir, 'events.jsonl');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('jsonlSink', () => {
  test('returns an unsubscribe function', () => {
    const unsub = jsonlSink(bus, { path: logPath });
    expect(typeof unsub).toBe('function');
  });

  test('creates the file and writes one JSON line per event', async () => {
    jsonlSink(bus, { path: logPath });
    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });

    await new Promise((r) => setTimeout(r, 50));
    const raw = await readFile(logPath, 'utf8');
    const line = raw.trim().split('\n')[0];
    expect(line).toBeDefined();
    const row = JSON.parse(line ?? '') as {
      timestamp: string;
      event: string;
      payload: unknown;
    };

    expect(row.event).toBe('run.start');
    expect(row.payload).toEqual({ runId: 'r1', conversationId: 'c1', input: {} });
    expect(() => new Date(row.timestamp).toISOString()).not.toThrow();
    expect(row.timestamp).toBe(new Date(row.timestamp).toISOString());
  });

  test('appends without truncating previous lines', async () => {
    jsonlSink(bus, { path: logPath });
    bus.emit('run.start', { runId: 'r1', conversationId: 'c1', input: {} });
    bus.emit('turn.start', { runId: 'r1', turn: 1 });

    await new Promise((r) => setTimeout(r, 50));
    const raw = await readFile(logPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0] ?? '{}') as { event: string };
    const second = JSON.parse(lines[1] ?? '{}') as { event: string };
    expect(first.event).toBe('run.start');
    expect(second.event).toBe('turn.start');
  });

  test('unsubscribe stops writes; later emits are ignored', async () => {
    const unsub = jsonlSink(bus, { path: logPath });
    bus.emit('run.finish', { runId: 'r1', result: {} });
    await new Promise((r) => setTimeout(r, 50));
    unsub();
    bus.emit('run.start', { runId: 'r2', conversationId: 'c2', input: {} });

    await new Promise((r) => setTimeout(r, 50));
    const raw = await readFile(logPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    const row = JSON.parse(lines[0] ?? '{}') as { event: string };
    expect(row.event).toBe('run.finish');
  });

  test('records provider.call (all HarnessEvents are subscribed)', async () => {
    jsonlSink(bus, { path: logPath });
    bus.emit('provider.call', {
      runId: 'r1',
      providerId: 'p1',
      request: { messages: [] },
    });

    await new Promise((r) => setTimeout(r, 50));
    const raw = await readFile(logPath, 'utf8');
    const row = JSON.parse(raw.trim()) as { event: string; payload: { providerId: string } };
    expect(row.event).toBe('provider.call');
    expect(row.payload.providerId).toBe('p1');
  });

  test('serializes run.error payload including HarnessError', async () => {
    jsonlSink(bus, { path: logPath });
    const err = new ToolError('nope', { toolName: 'fs' });
    bus.emit('run.error', { runId: 'r1', error: err });

    await new Promise((r) => setTimeout(r, 50));
    const raw = await readFile(logPath, 'utf8');
    const row = JSON.parse(raw.trim()) as {
      event: string;
      payload: { error: { name: string; message: string; toolName: string } };
    };
    expect(row.event).toBe('run.error');
    expect(row.payload.error.name).toBe('ToolError');
    expect(row.payload.error.message).toBe('nope');
    expect(row.payload.error.toolName).toBe('fs');
  });
});
