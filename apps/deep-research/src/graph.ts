import type { Agent, Checkpointer, GraphNode, Tool } from '@harness/agent';
import { graph, interrupt } from '@harness/agent';
import type { Provider } from '@harness/core';
import { createFactCheckerAgent } from './agents/fact-checker.ts';
import { createPlannerNode } from './agents/planner.ts';
import { createResearcherTool } from './agents/researcher.ts';
import { createWriterAgent } from './agents/writer.ts';
import type { ResearchPlan } from './schemas/plan.ts';
import type { Finding } from './schemas/report.ts';
import { Finding as FindingSchema } from './schemas/report.ts';

const MAX_FACT_CHECK_RETRIES = 2;

export interface ResearchGraphOpts {
  provider: Provider;
  tools?: Tool[];
  depth?: string;
  skipApproval?: boolean;
  checkpointer?: Checkpointer;
}

export function createResearchGraph(opts: ResearchGraphOpts): Agent {
  const { provider, tools = [], depth, skipApproval = false, checkpointer } = opts;

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
    fn: async (state, ctx) => {
      const plan = state.plan as ResearchPlan;
      const researcherTool = createResearcherTool(provider, tools);
      const toolCtx = {
        runId: ctx.runId,
        conversationId: ctx.conversationId,
        signal: ctx.signal,
      };

      const findings: Finding[] = [];
      for (const sq of plan.subquestions) {
        const result = await researcherTool.execute(
          { input: `[${sq.id}] ${sq.question}` },
          toolCtx,
        );
        try {
          findings.push(FindingSchema.parse(JSON.parse(result as string)));
        } catch {
          findings.push({ subquestionId: sq.id, summary: result as string, sourceUrls: [] });
        }
      }

      return { ...state, findings };
    },
  };

  const writeNode: GraphNode = {
    id: 'write',
    fn: async (state, ctx) => {
      const writer = createWriterAgent(provider);
      const findings = state.findings as Finding[];
      const findingsText = findings
        .map(
          (f) =>
            `[${f.subquestionId}]: ${f.summary}\nSources: ${f.sourceUrls.join(', ') || 'none'}`,
        )
        .join('\n\n');

      const result = await writer.run(
        { userMessage: `Write a research report from these findings:\n\n${findingsText}` },
        { signal: ctx.signal },
      );
      return { ...state, reportText: result.finalMessage };
    },
  };

  const factCheckNode: GraphNode = {
    id: 'fact-check',
    fn: async (state, ctx) => {
      const checker = createFactCheckerAgent(provider);
      const retries = ((state.factCheckRetries as number) ?? 0) + 1;

      const result = await checker.run(
        { userMessage: `Verify citations in this report:\n\n${state.reportText}` },
        { signal: ctx.signal },
      );

      try {
        const parsed = JSON.parse(result.finalMessage as string);
        return { ...state, factCheckPassed: parsed.pass === true, factCheckRetries: retries };
      } catch {
        return { ...state, factCheckPassed: false, factCheckRetries: retries };
      }
    },
  };

  const finalizeNode: GraphNode = {
    id: 'finalize',
    fn: async (state) => state,
  };

  return graph({
    nodes: [planNode, approveNode, researchNode, writeNode, factCheckNode, finalizeNode],
    edges: [
      { from: 'plan', to: 'approve' },
      { from: 'approve', to: 'research' },
      { from: 'research', to: 'write' },
      { from: 'write', to: 'fact-check' },
      {
        from: 'fact-check',
        to: (state) => {
          const retries = (state.factCheckRetries as number) ?? 0;
          if (state.factCheckPassed || retries >= MAX_FACT_CHECK_RETRIES) {
            return 'finalize';
          }
          return 'write';
        },
      },
    ],
    entryNode: 'plan',
    ...(checkpointer ? { checkpointer } : {}),
  });
}
