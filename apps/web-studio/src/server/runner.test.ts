import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { UIEvent } from '../shared/events.ts';
import { createPersistence, type Persistence } from './persistence.ts';
import { startRun } from './runner.ts';

let persistence: Persistence;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runner-'));
  persistence = createPersistence(tmpDir);
});

afterEach(() => {
  persistence.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function collectEvents(iter: AsyncIterable<UIEvent>): Promise<UIEvent[]> {
  const events: UIEvent[] = [];
  for await (const ev of iter) {
    events.push(ev);
  }
  return events;
}

describe('startRun', () => {
  it('throws for unknown tool', () => {
    const ac = new AbortController();
    expect(() =>
      startRun({
        runId: 'r1',
        toolId: 'nonexistent',
        question: 'test',
        settings: {},
        signal: ac.signal,
        abortController: ac,
        persistence,
        apiKey: 'fake-key',
      }),
    ).toThrow('Unknown tool: nonexistent');
  });

  it('creates a run record in persistence', () => {
    const ac = new AbortController();
    const handle = startRun({
      runId: 'r1',
      toolId: 'deep-research',
      question: 'What is X?',
      settings: {},
      signal: ac.signal,
      abortController: ac,
      persistence,
      apiKey: 'fake-key',
    });

    expect(handle.runId).toBe('r1');
    const run = persistence.getRun('r1');
    expect(run).toBeDefined();
    expect(run?.status).toBe('running');
    expect(run?.toolId).toBe('deep-research');

    ac.abort();
  });

  it('emits error events on abort and marks run cancelled', async () => {
    const ac = new AbortController();
    const handle = startRun({
      runId: 'r2',
      toolId: 'deep-research',
      question: 'What is Y?',
      settings: {},
      signal: ac.signal,
      abortController: ac,
      persistence,
      apiKey: 'fake-key',
    });

    // Abort immediately so the agent stream fails
    ac.abort();

    const events = await collectEvents(handle.events);
    const errorEvts = events.filter((e) => e.type === 'error');
    const statusEvts = events.filter((e) => e.type === 'status');

    expect(errorEvts.length).toBeGreaterThanOrEqual(1);
    expect(statusEvts.length).toBeGreaterThanOrEqual(1);

    const lastStatus = statusEvts[statusEvts.length - 1];
    if (lastStatus.type === 'status') {
      expect(lastStatus.status).toBe('cancelled');
    }

    const run = persistence.getRun('r2');
    expect(run?.status).toBe('cancelled');
  });

  it('persists events to SQLite', async () => {
    const ac = new AbortController();
    const handle = startRun({
      runId: 'r3',
      toolId: 'deep-research',
      question: 'Test persistence',
      settings: {},
      signal: ac.signal,
      abortController: ac,
      persistence,
      apiKey: 'fake-key',
    });

    // Abort to trigger quick termination
    ac.abort();
    await collectEvents(handle.events);

    const storedEvents = persistence.getEvents('r3');
    expect(storedEvents.length).toBeGreaterThanOrEqual(1);
  });
});
