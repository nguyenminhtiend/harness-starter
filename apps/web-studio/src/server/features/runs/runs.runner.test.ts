import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { UIEvent } from '../../../shared/events.ts';
import { createDatabase } from '../../infra/db.ts';
import { createSettingsStore, type SettingsStore } from '../settings/settings.store.ts';
import { createApprovalStore } from './runs.approval.ts';
import { createHitlSessionStore } from './runs.hitl.ts';
import { startRun } from './runs.runner.ts';
import { createRunStore, type RunStore } from './runs.store.ts';

let db: Database;
let runStore: RunStore;
let settingsStore: SettingsStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runner-'));
  db = createDatabase(tmpDir);
  runStore = createRunStore(db);
  settingsStore = createSettingsStore(db);
});

afterEach(() => {
  db.close();
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
    apiKey: 'fake-key',
  };
}

function makeDeps() {
  return {
    runStore,
    settingsStore,
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
        makeDeps(),
      ),
    ).toThrow('Unknown tool: nonexistent');
  });

  it('creates a run record in persistence', async () => {
    const ac = new AbortController();
    const handle = startRun(
      makeRunCtx({ runId: 'r1', question: 'What is X?', signal: ac.signal, abortController: ac }),
      makeDeps(),
    );

    expect(handle.runId).toBe('r1');
    const run = runStore.getRun('r1');
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
      makeDeps(),
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

    const run = runStore.getRun('r2');
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
      makeDeps(),
    );

    ac.abort();
    await collectEvents(handle.events);

    const storedEvents = runStore.getEvents('r3');
    expect(storedEvents.length).toBeGreaterThanOrEqual(1);
  });
});
