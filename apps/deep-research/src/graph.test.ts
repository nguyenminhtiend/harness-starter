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

function textResponse(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 } },
    { type: 'finish', reason: 'stop' },
  ];
}

const samplePlan = {
  question: 'What is CRDT?',
  subquestions: [{ id: 'q1', question: 'What are CRDTs?', searchQueries: ['CRDT'] }],
};

async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of stream) {
    events.push(ev);
  }
  return events;
}

describe('createResearchGraph', () => {
  it('interrupts at approve node and checkpoints the plan', async () => {
    const checkpointer = inMemoryCheckpointer();
    const provider = fakeProvider([{ events: planResponse(samplePlan) }]);

    const agent = createResearchGraph({
      provider,
      skipApproval: false,
      checkpointer,
    });

    const events = await collectEvents(
      agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }),
    );

    const checkpointEvents = events.filter((e) => e.type === 'checkpoint');
    expect(checkpointEvents.length).toBeGreaterThanOrEqual(1);

    const saved = await checkpointer.load('r1');
    expect(saved).not.toBeNull();

    const gs = saved?.graphState as { currentNode: string; data: Record<string, unknown> };
    expect(gs.currentNode).toBe('approve');
    expect(gs.data.plan).toEqual(samplePlan);
  });

  it('skips approval and completes full flow when skipApproval=true', async () => {
    const provider = fakeProvider([
      { events: planResponse(samplePlan) },
      { events: textResponse('# CRDT Report\n\nCRDTs are conflict-free replicated data types.') },
    ]);

    const agent = createResearchGraph({
      provider,
      skipApproval: true,
    });

    const events = await collectEvents(
      agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }),
    );

    const text = events
      .filter(
        (e): e is AgentEvent & { type: 'text-delta'; delta: string } => e.type === 'text-delta',
      )
      .map((e) => e.delta)
      .join('');

    expect(text).toContain('CRDT');
  });

  it('resumes from checkpoint after approval and completes research', async () => {
    const checkpointer = inMemoryCheckpointer();

    // Phase 1: plan + interrupt
    const p1 = fakeProvider([{ events: planResponse(samplePlan) }]);
    const g1 = createResearchGraph({ provider: p1, skipApproval: false, checkpointer });
    await collectEvents(g1.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }));

    const saved = await checkpointer.load('r1');
    expect(saved).not.toBeNull();

    // Simulate user approval by patching checkpoint state
    if (saved) {
      const gs = saved.graphState as { data: Record<string, unknown> };
      gs.data.approved = true;
      await checkpointer.save('r1', { ...saved, graphState: saved.graphState });
    }

    // Phase 2: resume → approve passes → research runs
    const p2 = fakeProvider([{ events: textResponse('# CRDT Report\n\nResearch complete.') }]);
    const g2 = createResearchGraph({ provider: p2, skipApproval: false, checkpointer });
    const events = await collectEvents(
      g2.stream({ userMessage: 'What is CRDT?' }, { runId: 'r1' }),
    );

    const text = events
      .filter(
        (e): e is AgentEvent & { type: 'text-delta'; delta: string } => e.type === 'text-delta',
      )
      .map((e) => e.delta)
      .join('');

    expect(text).toContain('Research complete');
  });

  it('respects depth parameter for planner', async () => {
    const checkpointer = inMemoryCheckpointer();
    const deepPlan = {
      question: 'What is CRDT?',
      subquestions: Array.from({ length: 8 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Subquestion ${i + 1}`,
        searchQueries: [`query-${i + 1}`],
      })),
    };

    const provider = fakeProvider([{ events: planResponse(deepPlan) }]);
    const agent = createResearchGraph({
      provider,
      depth: 'deep',
      skipApproval: false,
      checkpointer,
    });

    await collectEvents(agent.stream({ userMessage: 'What is CRDT?' }, { runId: 'r2' }));

    const saved = await checkpointer.load('r2');
    const gs = saved?.graphState as { data: Record<string, unknown> };
    const plan = gs.data.plan as { subquestions: unknown[] };
    expect(plan.subquestions).toHaveLength(8);
  });
});
