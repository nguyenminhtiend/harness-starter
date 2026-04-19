import { describe, expect, it } from 'bun:test';
import { inMemoryCheckpointer } from '@harness/agent';
import { fakeProvider } from '@harness/core/testing';
import { createResearchGraph } from './graph.ts';
import {
  collectEvents,
  factCheckFail,
  factCheckPass,
  planResponse,
  sampleFinding,
  samplePlan,
  sampleReport,
  textScript,
} from './test-utils.ts';

describe('createResearchGraph', () => {
  it('completes full happy path with skipApproval', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([
      { events: planResponse(samplePlan) },
      { events: textScript(JSON.stringify(sampleFinding)) },
      { events: textScript(JSON.stringify(sampleReport)) },
      { events: textScript(JSON.stringify(factCheckPass)) },
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
    expect(checkpointEvents[0]).toHaveProperty('type', 'checkpoint');
    for (const ev of checkpointEvents) {
      expect(ev).toHaveProperty('runId', 'r1');
    }

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
      { events: textScript(JSON.stringify(sampleFinding)) },
      { events: textScript(JSON.stringify(sampleReport)) },
      { events: textScript(JSON.stringify(factCheckPass)) },
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
      { events: textScript(JSON.stringify(sampleFinding)) },
      { events: textScript(JSON.stringify(sampleReport)) },
      { events: textScript(JSON.stringify(factCheckFail)) },
      { events: textScript(JSON.stringify(sampleReport)) },
      { events: textScript(JSON.stringify(factCheckFail)) },
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
      { events: textScript(JSON.stringify(sampleFinding)) },
      { events: textScript(JSON.stringify(sampleReport)) },
      { events: textScript(JSON.stringify(factCheckFail)) },
      { events: textScript(JSON.stringify(sampleReport)) },
      { events: textScript(JSON.stringify(factCheckPass)) },
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
