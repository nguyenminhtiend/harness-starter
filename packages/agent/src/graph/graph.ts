import type {
  Agent,
  AgentEvent,
  GraphDef,
  GraphEdge,
  RunContext,
  RunInput,
  RunOptions,
  RunResult,
} from '../types.ts';
import { InterruptSignal } from './interrupt.ts';

interface GraphState {
  currentNode: string;
  data: Record<string, unknown>;
  completed: boolean;
}

const END_NODE = '__end__';

export function graph(def: GraphDef): Agent {
  const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map<string, GraphEdge>();
  for (const edge of def.edges) {
    edgeMap.set(edge.from, edge);
  }

  async function* stream(input: RunInput, opts?: RunOptions): AsyncGenerator<AgentEvent, void> {
    const runId = opts?.runId ?? crypto.randomUUID();
    const conversationId = input.conversationId ?? crypto.randomUUID();
    const signal = opts?.signal ?? new AbortController().signal;
    const ctx: RunContext = { runId, conversationId, signal };

    let graphState: GraphState = {
      currentNode: def.entryNode,
      data: { ...(input as Record<string, unknown>) },
      completed: false,
    };

    // Resume from checkpoint
    if (def.checkpointer) {
      const saved = await def.checkpointer.load(runId);
      if (saved?.graphState) {
        graphState = saved.graphState as GraphState;
      }
    }

    while (!graphState.completed) {
      if (signal.aborted) {
        yield { type: 'abort', reason: signal.reason };
        return;
      }

      const node = nodeMap.get(graphState.currentNode);
      if (!node) {
        throw new Error(`Graph node not found: ${graphState.currentNode}`);
      }

      try {
        // Execute node
        if (node.agent) {
          const agentInput: RunInput = {
            conversationId,
            ...(typeof graphState.data.userMessage === 'string'
              ? { userMessage: graphState.data.userMessage }
              : {}),
          };

          for await (const ev of node.agent.stream(agentInput, { signal, runId })) {
            yield ev;
          }
        } else if (node.fn) {
          graphState.data = await node.fn(graphState.data, ctx);
        }
      } catch (e) {
        if (e instanceof InterruptSignal) {
          // Save checkpoint and pause
          if (def.checkpointer) {
            await def.checkpointer.save(runId, {
              runId,
              conversationId,
              turn: 0,
              messages: [],
              graphState,
            });
            yield { type: 'checkpoint', runId, turn: 0 };
          }
          return;
        }
        throw e;
      }

      // Resolve next node
      const edge = edgeMap.get(graphState.currentNode);
      if (!edge) {
        graphState.completed = true;
        break;
      }

      const nextNode = typeof edge.to === 'function' ? edge.to(graphState.data) : edge.to;

      if (nextNode === END_NODE) {
        graphState.completed = true;
      } else {
        graphState.currentNode = nextNode;
      }

      // Checkpoint on transition
      if (def.checkpointer && !graphState.completed) {
        await def.checkpointer.save(runId, {
          runId,
          conversationId,
          turn: 0,
          messages: [],
          graphState,
        });
        yield { type: 'checkpoint', runId, turn: 0 };
      }
    }
  }

  async function run(input: RunInput, opts?: RunOptions): Promise<RunResult> {
    let finalMessage: unknown;
    let turns = 0;

    for await (const event of stream(input, opts)) {
      switch (event.type) {
        case 'turn-start':
          turns = event.turn;
          break;
        case 'text-delta':
          if (typeof finalMessage === 'string') {
            finalMessage += event.delta;
          } else {
            finalMessage = event.delta;
          }
          break;
      }
    }

    return { finalMessage, turns };
  }

  return { run, stream };
}
