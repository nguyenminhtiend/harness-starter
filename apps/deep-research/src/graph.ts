import type { Agent, Checkpointer, GraphNode } from '@harness/agent';
import { graph, interrupt } from '@harness/agent';
import type { Provider } from '@harness/core';
import { createPlannerNode } from './agents/planner.ts';
import { createResearchAgent } from './agents/researcher.ts';

export interface ResearchGraphOpts {
  provider: Provider;
  depth?: string;
  skipApproval?: boolean;
  checkpointer?: Checkpointer;
}

export function createResearchGraph(opts: ResearchGraphOpts): Agent {
  const { provider, depth, skipApproval = false, checkpointer } = opts;

  const planNode = createPlannerNode(provider, depth);

  const approveNode: GraphNode = {
    id: 'approve',
    fn: async (state) => {
      if (skipApproval || state.approved) {
        return state;
      }
      interrupt('plan-approval');
    },
  };

  const researchNode: GraphNode = {
    id: 'research',
    agent: createResearchAgent(provider),
  };

  return graph({
    nodes: [planNode, approveNode, researchNode],
    edges: [
      { from: 'plan', to: 'approve' },
      { from: 'approve', to: 'research' },
    ],
    entryNode: 'plan',
    ...(checkpointer ? { checkpointer } : {}),
  });
}
