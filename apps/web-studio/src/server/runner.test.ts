import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { UIEvent } from '../shared/events.ts';
import { createHitlSessionStore } from './active-hitl-sessions.ts';
import { createApprovalStore } from './approval.ts';
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

function makeRunCtx(overrides: {
  runId: string;
  toolId?: string;
  question?: string;
  signal: AbortSignal;
  abortController: AbortController;
}) {
  return {
    runId: overrides.runId,
    toolId: overrides.toolId ?? 'deep-research',
    question: overrides.question ?? 'test',
    settings: {},
    signal: overrides.signal,
    abortController: overrides.abortController,
    persistence,
    apiKey: 'fake-key',
    approvalStore: createApprovalStore(),
    hitlSessionStore: createHitlSessionStore(),
  };
}

describe('startRun', () => {
  it('throws for unknown tool', () => {
    const ac = new AbortController();
    expect(() =>
      startRun(
        makeRunCtx({ runId: 'r1', toolId: 'nonexistent', signal: ac.signal, abortController: ac }),
      ),
    ).toThrow('Unknown tool: nonexistent');
  });

  it('creates a run record in persistence', async () => {
    const ac = new AbortController();
    const handle = startRun(
      makeRunCtx({ runId: 'r1', question: 'What is X?', signal: ac.signal, abortController: ac }),
    );

    expect(handle.runId).toBe('r1');
    const run = persistence.getRun('r1');
    expect(run).toBeDefined();
    expect(run?.status).toBe('running');
    expect(run?.toolId).toBe('deep-research');

    ac.abort();
    await collectEvents(handle.events);
  });

  it('emits error events on abort and marks run cancelled', async () => {
    const ac = new AbortController();
    const handle = startRun(
      makeRunCtx({ runId: 'r2', question: 'What is Y?', signal: ac.signal, abortController: ac }),
    );

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
    const handle = startRun(
      makeRunCtx({
        runId: 'r3',
        question: 'Test persistence',
        signal: ac.signal,
        abortController: ac,
      }),
    );

    ac.abort();
    await collectEvents(handle.events);

    const storedEvents = persistence.getEvents('r3');
    expect(storedEvents.length).toBeGreaterThanOrEqual(1);
  });
});
