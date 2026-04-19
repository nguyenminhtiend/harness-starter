import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { inMemoryCheckpointer } from '@harness/agent';
import { fakeProvider } from '@harness/core/testing';
import { createResearchGraph } from '../src/graph.ts';
import { writeReport } from '../src/report/write.ts';
import type { Report } from '../src/schemas/report.ts';
import {
  sampleFinding as baseFinding,
  sampleReport as baseReport,
  collectEvents,
  factCheckPass,
  planResponse,
  samplePlan,
  textScript,
} from '../src/test-utils.ts';

const sampleFinding = JSON.stringify(baseFinding);
const sampleReport = JSON.stringify({
  ...baseReport,
  sections: [{ heading: 'Overview', body: 'CRDTs are distributed data structures [1].' }],
});
const factCheckFail = JSON.stringify({ pass: false, issues: ['Bad citation [2]'] });

let tmpDir: string;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

describe('integration: full pipeline', () => {
  it('happy path: plan → research → write → fact-check pass → finalize', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([
      { events: planResponse(samplePlan) },
      { events: textScript(sampleFinding) },
      { events: textScript(sampleReport) },
      { events: textScript(JSON.stringify(factCheckPass)) },
    ]);

    const agent = createResearchGraph({
      provider,
      skipApproval: true,
      checkpointer,
    });

    const events = await collectEvents(
      agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'int-1' }),
    );

    const saved = await checkpointer.load('int-1');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };

    expect(gs.data.plan).toBeDefined();
    expect(gs.data.findings).toBeDefined();
    expect(gs.data.reportText).toBeDefined();
    expect(gs.data.factCheckPassed).toBe(true);
    expect(gs.currentNode).toBe('finalize');

    const checkpointEvents = events.filter((e) => e.type === 'checkpoint');
    expect(checkpointEvents.length).toBeGreaterThan(0);
  });

  it('fact-check retry: fail → retry writer → pass', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([
      { events: planResponse(samplePlan) },
      { events: textScript(sampleFinding) },
      { events: textScript(sampleReport) },
      { events: textScript(factCheckFail) },
      { events: textScript(sampleReport) },
      { events: textScript(JSON.stringify(factCheckPass)) },
    ]);

    const agent = createResearchGraph({
      provider,
      skipApproval: true,
      checkpointer,
    });

    await collectEvents(agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'int-2' }));

    const saved = await checkpointer.load('int-2');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };

    expect(gs.data.factCheckPassed).toBe(true);
    expect(gs.data.factCheckRetries).toBe(2);
    expect(gs.currentNode).toBe('finalize');
  });

  it('report file is written atomically to a temp directory', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-test-'));

    const report: Report = {
      title: 'CRDTs',
      sections: [{ heading: 'Overview', body: 'CRDTs are distributed data structures.' }],
      references: [{ url: 'https://en.wikipedia.org/wiki/CRDT' }],
    };

    const filePath = await writeReport(report, tmpDir, 'crdt-test');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# CRDTs');
    expect(content).toContain('## Overview');
    expect(content).toContain('https://en.wikipedia.org/wiki/CRDT');
  });

  it('fact-check exhaustion: fail twice → proceed to finalize anyway', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([
      { events: planResponse(samplePlan) },
      { events: textScript(sampleFinding) },
      { events: textScript(sampleReport) },
      { events: textScript(factCheckFail) },
      { events: textScript(sampleReport) },
      { events: textScript(factCheckFail) },
    ]);

    const agent = createResearchGraph({
      provider,
      skipApproval: true,
      checkpointer,
    });

    await collectEvents(agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'int-3' }));

    const saved = await checkpointer.load('int-3');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };

    expect(gs.data.factCheckPassed).toBe(false);
    expect(gs.data.factCheckRetries).toBe(2);
    expect(gs.currentNode).toBe('finalize');
  });

  it('HITL: interrupts at approval, resumes after patching checkpoint', async () => {
    const checkpointer = inMemoryCheckpointer();

    const p1 = fakeProvider([{ events: planResponse(samplePlan) }]);
    const g1 = createResearchGraph({
      provider: p1,
      skipApproval: false,
      checkpointer,
    });

    await collectEvents(g1.stream({ userMessage: 'What is CRDT?' }, { runId: 'int-4' }));

    const saved = await checkpointer.load('int-4');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(gs.currentNode).toBe('approve');
    expect(gs.data.plan).toBeDefined();

    gs.data.approved = true;
    if (saved) {
      await checkpointer.save('int-4', saved);
    }

    const p2 = fakeProvider([
      { events: textScript(sampleFinding) },
      { events: textScript(sampleReport) },
      { events: textScript(JSON.stringify(factCheckPass)) },
    ]);
    const g2 = createResearchGraph({
      provider: p2,
      skipApproval: false,
      checkpointer,
    });

    await collectEvents(g2.stream({ userMessage: 'What is CRDT?' }, { runId: 'int-4' }));

    const final = await checkpointer.load('int-4');
    const finalGs = final?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(finalGs.data.factCheckPassed).toBe(true);
    expect(finalGs.currentNode).toBe('finalize');
  });
});
