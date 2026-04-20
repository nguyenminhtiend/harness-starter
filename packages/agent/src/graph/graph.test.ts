import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { inMemoryCheckpointer } from '../checkpoint/memory.ts';
import { createAgent } from '../create-agent.ts';
import type { AgentEvent, GraphDef } from '../types.ts';
import { graph } from './graph.ts';
import { interrupt } from './interrupt.ts';

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'stop' },
  ];
}

describe('graph', () => {
  test('linear graph A -> B -> C executes in order', async () => {
    const log: string[] = [];

    const def: GraphDef = {
      nodes: [
        {
          id: 'A',
          fn: async (state) => {
            log.push('A');
            return { ...state, a: true };
          },
        },
        {
          id: 'B',
          fn: async (state) => {
            log.push('B');
            return { ...state, b: true };
          },
        },
        {
          id: 'C',
          fn: async (state) => {
            log.push('C');
            return { ...state, c: true };
          },
        },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
      entryNode: 'A',
    };

    const agent = graph(def);
    await agent.run({ userMessage: 'test' });

    expect(log).toEqual(['A', 'B', 'C']);
  });

  test('conditional edge routes based on state', async () => {
    const log: string[] = [];

    const def: GraphDef = {
      nodes: [
        {
          id: 'router',
          fn: async (state) => {
            log.push('router');
            return { ...state, route: 'fast' };
          },
        },
        {
          id: 'fast',
          fn: async (state) => {
            log.push('fast');
            return state;
          },
        },
        {
          id: 'slow',
          fn: async (state) => {
            log.push('slow');
            return state;
          },
        },
      ],
      edges: [
        {
          from: 'router',
          to: (state) => (state.route === 'fast' ? 'fast' : 'slow'),
        },
      ],
      entryNode: 'router',
    };

    const agent = graph(def);
    await agent.run({ userMessage: 'test' });

    expect(log).toEqual(['router', 'fast']);
  });

  test('checkpoint saved on each transition', async () => {
    const checkpointer = inMemoryCheckpointer();

    const def: GraphDef = {
      nodes: [
        { id: 'A', fn: async (state) => state },
        { id: 'B', fn: async (state) => state },
        { id: 'C', fn: async (state) => state },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
      entryNode: 'A',
      checkpointer,
    };

    const agent = graph(def);
    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'test' }, { runId: 'r1' })) {
      events.push(ev);
    }

    const checkpoints = events.filter((e) => e.type === 'checkpoint');
    expect(checkpoints.length).toBe(2);
    expect(checkpoints[0]).toMatchObject({ turn: 1 });
    expect(checkpoints[1]).toMatchObject({ turn: 2 });
  });

  test('handoff events emitted on graph transitions with correct from/to', async () => {
    const def: GraphDef = {
      nodes: [
        { id: 'A', fn: async (state) => state },
        { id: 'B', fn: async (state) => state },
        { id: 'C', fn: async (state) => state },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
      entryNode: 'A',
    };

    const agent = graph(def);
    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'test' })) {
      events.push(ev);
    }

    const handoffs = events.filter((e) => e.type === 'handoff');
    expect(handoffs).toEqual([
      { type: 'handoff', from: 'A', to: 'B' },
      { type: 'handoff', from: 'B', to: 'C' },
    ]);
  });

  test('handoff labels are correct on conditional retry edges', async () => {
    let runs = 0;
    const def: GraphDef = {
      nodes: [
        { id: 'start', fn: async (state) => state },
        {
          id: 'check',
          fn: async (state) => {
            runs++;
            return { ...state, pass: runs >= 2 };
          },
        },
        { id: 'done', fn: async (state) => state },
      ],
      edges: [
        { from: 'start', to: 'check' },
        { from: 'check', to: (state) => (state.pass ? 'done' : 'start') },
      ],
      entryNode: 'start',
    };

    const agent = graph(def);
    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'test' })) {
      events.push(ev);
    }

    const handoffs = events.filter((e) => e.type === 'handoff');
    expect(handoffs).toEqual([
      { type: 'handoff', from: 'start', to: 'check' },
      { type: 'handoff', from: 'check', to: 'start' },
      { type: 'handoff', from: 'start', to: 'check' },
      { type: 'handoff', from: 'check', to: 'done' },
    ]);
  });

  test('interrupt() pauses graph and saves checkpoint', async () => {
    const checkpointer = inMemoryCheckpointer();
    const log: string[] = [];

    const def: GraphDef = {
      nodes: [
        {
          id: 'A',
          fn: async (state) => {
            log.push('A');
            return state;
          },
        },
        {
          id: 'B',
          fn: async (_state, _ctx) => {
            log.push('B-start');
            interrupt('Need human input');
            // unreachable
          },
        },
        {
          id: 'C',
          fn: async (state) => {
            log.push('C');
            return state;
          },
        },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
      entryNode: 'A',
      checkpointer,
    };

    const agent = graph(def);

    // First run: A executes, B interrupts
    const events: AgentEvent[] = [];
    for await (const ev of agent.stream({ userMessage: 'test' }, { runId: 'r1' })) {
      events.push(ev);
    }

    expect(log).toEqual(['A', 'B-start']);

    // Checkpoint should be saved at B
    const saved = await checkpointer.load('r1');
    expect(saved).not.toBeNull();
    expect((saved?.graphState as { currentNode: string })?.currentNode).toBe('B');
  });

  test('graph with agent nodes streams AgentEvents', async () => {
    const provider = fakeProvider([{ events: textScript('Agent A output') }]);
    const agentA = createAgent({ provider });

    const def: GraphDef = {
      nodes: [{ id: 'agent_a', agent: agentA }],
      edges: [],
      entryNode: 'agent_a',
    };

    const graphAgent = graph(def);
    const events: AgentEvent[] = [];
    for await (const ev of graphAgent.stream({ userMessage: 'Hi' })) {
      events.push(ev);
    }

    const textDeltas = events.filter((e) => e.type === 'text-delta');
    expect(textDeltas.length).toBeGreaterThan(0);
  });
});
