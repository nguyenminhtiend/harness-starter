import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApprovalStore, createHitlSessionStore } from '@harness/hitl';
import { parseModelSpec } from '@harness/llm-adapter';
import type { UIEvent } from '@harness/session-events';
import { createSessionStore, type SessionStore } from '@harness/session-store';
import { createDatabase } from '../../infra/db.ts';
import { createSettingsStore, type SettingsStore } from '../settings/settings.store.ts';
import { startSession } from './sessions.runner.ts';

let db: Database;
let sessionStore: SessionStore;
let settingsStore: SettingsStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-runner-'));
  db = createDatabase(tmpDir);
  sessionStore = createSessionStore(db);
  settingsStore = createSettingsStore(db);
});

afterEach(async () => {
  // Flush pending microtasks so in-flight generator catch/finally blocks
  // complete their DB writes before the connection closes.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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

function makeSessionCtx(overrides: {
  sessionId: string;
  toolId?: string;
  question?: string;
  signal: AbortSignal;
  abortController: AbortController;
}) {
  return {
    sessionId: overrides.sessionId,
    toolId: overrides.toolId ?? 'deep-research',
    question: overrides.question ?? 'test',
    settings: {},
    signal: overrides.signal,
    abortController: overrides.abortController,
    providerKeys: { google: 'fake-key', openrouter: 'fake-key', groq: 'fake-key' },
  };
}

function makeDeps() {
  return {
    sessionStore,
    settingsStore,
    approvalStore: createApprovalStore(),
    hitlSessionStore: createHitlSessionStore(),
  };
}

describe('parseModelSpec', () => {
  it('defaults to openrouter when no prefix', () => {
    expect(parseModelSpec('gpt-4')).toEqual({ provider: 'openrouter', model: 'gpt-4' });
  });

  it('parses google prefix', () => {
    expect(parseModelSpec('google:gemini-2.5-flash')).toEqual({
      provider: 'google',
      model: 'gemini-2.5-flash',
    });
  });

  it('parses groq prefix', () => {
    expect(parseModelSpec('groq:llama-3.3-70b-versatile')).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    });
  });
});

describe('startSession', () => {
  it('throws for unknown tool', () => {
    const ac = new AbortController();
    expect(() =>
      startSession(
        makeSessionCtx({
          sessionId: 's1',
          toolId: 'nonexistent',
          signal: ac.signal,
          abortController: ac,
        }),
        makeDeps(),
      ),
    ).toThrow('Unknown tool: nonexistent');
  });

  it('creates a session record in persistence', async () => {
    const ac = new AbortController();
    const handle = startSession(
      makeSessionCtx({
        sessionId: 's1',
        question: 'What is X?',
        signal: ac.signal,
        abortController: ac,
      }),
      makeDeps(),
    );

    expect(handle.sessionId).toBe('s1');
    const session = sessionStore.getSession('s1');
    expect(session).toBeDefined();
    expect(session?.status).toBe('running');
    expect(session?.toolId).toBe('deep-research');

    ac.abort();
    await collectEvents(handle.events);
  });

  it('emits error events on abort and marks session cancelled', async () => {
    const ac = new AbortController();
    const handle = startSession(
      makeSessionCtx({
        sessionId: 's2',
        question: 'What is Y?',
        signal: ac.signal,
        abortController: ac,
      }),
      makeDeps(),
    );

    ac.abort();

    const events = await collectEvents(handle.events);
    const errorEvts = events.filter((e) => e.type === 'error');
    const statusEvts = events.filter((e) => e.type === 'status');

    expect(errorEvts.length).toBeGreaterThanOrEqual(1);
    expect(statusEvts.length).toBeGreaterThanOrEqual(1);

    const lastStatus = statusEvts[statusEvts.length - 1];
    if (lastStatus?.type === 'status') {
      expect(lastStatus.status).toBe('cancelled');
    }

    const session = sessionStore.getSession('s2');
    expect(session?.status).toBe('cancelled');
  });

  it('persists events to SQLite', async () => {
    const ac = new AbortController();
    const handle = startSession(
      makeSessionCtx({
        sessionId: 's3',
        question: 'Test persistence',
        signal: ac.signal,
        abortController: ac,
      }),
      makeDeps(),
    );

    ac.abort();
    await collectEvents(handle.events);

    const storedEvents = sessionStore.getEvents('s3');
    expect(storedEvents.length).toBeGreaterThanOrEqual(1);
  });
});
