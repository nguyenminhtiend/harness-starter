import { describe, expect, it } from 'bun:test';
import type { AgentEvent } from '@harness/agent';
import { inMemoryCheckpointer } from '@harness/agent';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { createResearchGraph } from './graph.ts';

function planResponse(plan: object): StreamEvent[] {
  return [
    { type: 'text-delta', delta: JSON.stringify(plan) },
    { type: 'usage', tokens: { inputTokens: 50, outputTokens: 30, totalTokens: 80 } },
    { type: 'finish', reason: 'stop' },
  ];
}

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 50, outputTokens: 50, totalTokens: 100 } },
    { type: 'finish', reason: 'stop' },
  ];
}

const samplePlan = {
  question: 'What is CRDT?',
  subquestions: [{ id: 'q1', question: 'What are CRDTs?', searchQueries: ['CRDT'] }],
};

const sampleFinding = JSON.stringify({
  subquestionId: 'q1',
  summary: 'CRDTs are conflict-free replicated data types.',
  sourceUrls: ['https://en.wikipedia.org/wiki/CRDT'],
});

const sampleReport = JSON.stringify({
  title: 'CRDTs',
  sections: [{ heading: 'Overview', body: 'CRDTs are distributed data structures.' }],
  references: [{ url: 'https://en.wikipedia.org/wiki/CRDT' }],
});

const factCheckPass = JSON.stringify({ pass: true, issues: [] });
const factCheckFail = JSON.stringify({ pass: false, issues: ['Bad citation'] });

async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of stream) {
    events.push(ev);
  }
  return events;
}

describe('createResearchGraph', () => {
  it('completes full happy path with skipApproval', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([
      { events: planResponse(samplePlan) },
      { events: textScript(sampleFinding) },
      { events: textScript(sampleReport) },
      { events: textScript(factCheckPass) },
    ]);

    const agent = createResearchGraph({
      provider,
      tools: [],
      skipApproval: true,
      checkpointer,
    });

    await collectEvents(agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }));

    const saved = await checkpointer.load('r1');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(gs.data.plan).toBeDefined();
    expect(gs.data.findings).toBeDefined();
    expect(gs.data.reportText).toBeDefined();
    expect(gs.data.factCheckPassed).toBe(true);
  });

  it('interrupts at approve node and checkpoints the plan', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([{ events: planResponse(samplePlan) }]);

    const agent = createResearchGraph({
      provider,
      tools: [],
      skipApproval: false,
      checkpointer,
    });

    const events = await collectEvents(
      agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }),
    );

    const checkpointEvents = events.filter((e) => e.type === 'checkpoint');
    expect(checkpointEvents.length).toBeGreaterThanOrEqual(1);

    const saved = await checkpointer.load('r1');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(gs.currentNode).toBe('approve');
    expect(gs.data.plan).toEqual(samplePlan);
  });

  it('resumes from checkpoint after approval', async () => {
    const checkpointer = inMemoryCheckpointer();

    const p1 = fakeProvider([{ events: planResponse(samplePlan) }]);
    const g1 = createResearchGraph({
      provider: p1,
      tools: [],
      skipApproval: false,
      checkpointer,
    });
    await collectEvents(g1.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }));

    const saved = await checkpointer.load('r1');
    if (saved) {
      const gs = saved.graphState as { data: Record<string, unknown> };
      gs.data.approved = true;
      await checkpointer.save('r1', { ...saved, graphState: saved.graphState });
    }

    const p2 = fakeProvider([
      { events: textScript(sampleFinding) },
      { events: textScript(sampleReport) },
      { events: textScript(factCheckPass) },
    ]);
    const g2 = createResearchGraph({
      provider: p2,
      tools: [],
      skipApproval: false,
      checkpointer,
    });
    await collectEvents(g2.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }));

    const final = await checkpointer.load('r1');
    const gs = final?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(gs.data.factCheckPassed).toBe(true);
  });

  it('retries fact-check up to 2 times then proceeds to finalize', async () => {
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
      tools: [],
      skipApproval: true,
      checkpointer,
    });

    await collectEvents(agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }));

    const saved = await checkpointer.load('r1');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(gs.data.factCheckPassed).toBe(false);
    expect(gs.data.factCheckRetries).toBe(2);
    expect(gs.currentNode).toBe('finalize');
  });

  it('fact-check retry succeeds on second attempt', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([
      { events: planResponse(samplePlan) },
      { events: textScript(sampleFinding) },
      { events: textScript(sampleReport) },
      { events: textScript(factCheckFail) },
      { events: textScript(sampleReport) },
      { events: textScript(factCheckPass) },
    ]);

    const agent = createResearchGraph({
      provider,
      tools: [],
      skipApproval: true,
      checkpointer,
    });

    await collectEvents(agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }));

    const saved = await checkpointer.load('r1');
    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(gs.data.factCheckPassed).toBe(true);
    expect(gs.data.factCheckRetries).toBe(2);
  });
});
