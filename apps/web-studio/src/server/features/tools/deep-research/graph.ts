// Copied from apps/deep-research/src/graph.ts — clone-and-own (invariant 8)
import type { Agent, Checkpointer, ConversationStore, GraphNode, Tool } from '@harness/agent';
import { graph, inMemoryStore, interrupt } from '@harness/agent';
import type { EventBus, Provider } from '@harness/core';
import { checkFacts } from './agents/fact-checker.ts';
import { createPlannerNode } from './agents/planner.ts';
import { createResearcherTool } from './agents/researcher.ts';
import { generateReport } from './agents/writer.ts';
import type { BudgetSplit } from './budgets.ts';
import { extractUrls } from './guardrails/citation-check.ts';
import type { ResearchPlan } from './schemas/plan.ts';
import type { Finding, Report } from './schemas/report.ts';
import { Finding as FindingSchema } from './schemas/report.ts';

const MAX_FACT_CHECK_RETRIES = 2;

export interface ResearchState {
  [key: string]: unknown;
  userMessage: string;
  plan?: ResearchPlan;
  approved?: boolean;
  findings?: Finding[];
  report?: Report;
  reportText?: string;
  factCheckPassed?: boolean;
  factCheckRetries?: number;
  factCheckIssues?: string[];
}

export interface ResearchGraphOpts {
  provider: Provider;
  tools?: Tool[];
  depth?: string;
  skipApproval?: boolean;
  checkpointer?: Checkpointer;
  store?: ConversationStore;
  budgets?: BudgetSplit;
  events?: EventBus;
  plannerPrompt?: string | undefined;
  writerPrompt?: string | undefined;
  factCheckerPrompt?: string | undefined;
}

export function createResearchGraph(opts: ResearchGraphOpts): Agent {
  const {
    provider,
    tools = [],
    depth,
    skipApproval = false,
    checkpointer,
    store,
    budgets,
    events,
    plannerPrompt,
    writerPrompt,
    factCheckerPrompt,
  } = opts;
  const agentStore = store ?? inMemoryStore();

  const planNode = createPlannerNode(provider, {
    depth,
    systemPrompt: plannerPrompt,
  });

  const approveNode: GraphNode = {
    id: 'approve',
    fn: async (state) => {
      const s = state as ResearchState;
      if (skipApproval || s.approved) {
        return s;
      }
      interrupt('plan-approval');
    },
  };

  const researchNode: GraphNode = {
    id: 'research',
    fn: async (state, ctx) => {
      const s = state as ResearchState;
      if (!s.plan) {
        throw new Error('research node reached without a plan');
      }
      const plan = s.plan;
      const researcherTool = createResearcherTool(provider, tools, {
        memory: agentStore,
        budgets: budgets?.researcher,
        events,
      });
      const toolCtx = {
        runId: ctx.runId,
        conversationId: ctx.conversationId,
        signal: ctx.signal,
      };

      const findings = await Promise.all(
        plan.subquestions.map(async (sq) => {
          const result = await researcherTool.execute(
            { input: `[${sq.id}] ${sq.question}` },
            toolCtx,
          );
          try {
            return FindingSchema.parse(JSON.parse(result as string));
          } catch {
            return { subquestionId: sq.id, summary: result as string, sourceUrls: [] };
          }
        }),
      );

      return { ...state, findings };
    },
  };

  const writeNode: GraphNode = {
    id: 'write',
    fn: async (state, ctx) => {
      const s = state as ResearchState;
      const findings = s.findings ?? [];
      const findingsText = findings
        .map(
          (f) =>
            `[${f.subquestionId}]: ${f.summary}\nSources: ${f.sourceUrls.join(', ') || 'none'}`,
        )
        .join('\n\n');

      const issuesHint =
        s.factCheckIssues && s.factCheckIssues.length > 0
          ? `\n\nIMPORTANT — the previous draft failed fact-checking. Fix these issues:\n${s.factCheckIssues.map((i) => `- ${i}`).join('\n')}`
          : '';

      const report = await generateReport(provider, `${findingsText}${issuesHint}`, ctx.signal, {
        systemPrompt: writerPrompt,
      });

      const reportText = JSON.stringify(report);
      return { ...state, report, reportText };
    },
  };

  const factCheckNode: GraphNode = {
    id: 'fact-check',
    fn: async (state, ctx) => {
      const s = state as ResearchState;
      const retries = (s.factCheckRetries ?? 0) + 1;

      const findings = s.findings ?? [];
      const allSourceUrls = new Set(findings.flatMap((f) => f.sourceUrls));
      const sourceContext = findings
        .map((f) => `[${f.subquestionId}] Sources: ${f.sourceUrls.join(', ') || 'none'}`)
        .join('\n');

      const citedUrls = extractUrls(s.reportText ?? '');
      const unfetchedUrls = citedUrls.filter((u) => !allSourceUrls.has(u));

      let prompt = `Research sources:\n${sourceContext}\n\nVerify citations in this report:\n\n${s.reportText}`;
      if (unfetchedUrls.length > 0) {
        prompt += `\n\nWARNING: These URLs appear in the report but were NOT found in research sources: ${unfetchedUrls.join(', ')}`;
      }

      const parsed = await checkFacts(provider, prompt, ctx.signal, {
        systemPrompt: factCheckerPrompt,
      });

      return {
        ...state,
        factCheckPassed: parsed.pass,
        factCheckRetries: retries,
        factCheckIssues: parsed.issues,
      };
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
          const s = state as ResearchState;
          if (s.factCheckPassed || (s.factCheckRetries ?? 0) >= MAX_FACT_CHECK_RETRIES) {
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
