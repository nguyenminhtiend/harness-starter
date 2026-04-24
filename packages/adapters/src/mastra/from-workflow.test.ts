import { describe, expect, it } from 'bun:test';
import { mockModel } from '@harness/agents/testing';
import type { ApprovalDecision, ExecutionContext, StreamEventPayload } from '@harness/core';
import { createDeepResearchWorkflow } from '@harness/workflows';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { z } from 'zod';
import { fromMastraWorkflow } from './from-workflow.ts';

const fakePlan = {
  summary: 'Test plan',
  subquestions: [{ id: 'sq1', question: 'Why?' }],
};
const fakeFinding = { subquestionId: 'sq1', summary: 'Because reasons', sourceUrls: [] };
const fakeReport = {
  title: 'Report',
  sections: [{ heading: 'Answer', body: 'Because reasons [1].' }],
  references: [{ url: 'https://example.com/a', title: 'Source A' }],
};
const fakeFactCheck = { pass: true, issues: [] };

function buildModel() {
  return mockModel([
    { type: 'text', text: JSON.stringify(fakePlan) },
    { type: 'text', text: JSON.stringify(fakeFinding) },
    { type: 'text', text: JSON.stringify(fakeReport) },
    { type: 'text', text: JSON.stringify(fakeFactCheck) },
  ]);
}

function makeCapability(model: ReturnType<typeof mockModel>) {
  return fromMastraWorkflow({
    id: 'deep-research',
    title: 'Deep Research',
    description: 'Research with HITL',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.object({ reportText: z.string() }),
    settingsSchema: z.object({}),
    supportsApproval: true,
    workflowId: 'deepResearch',
    createMastra: () => {
      const wf = createDeepResearchWorkflow({ model });
      return new Mastra({
        workflows: { deepResearch: wf },
        storage: new LibSQLStore({ id: 'test', url: 'file::memory:?cache=shared' }),
      });
    },
    extractInput: (input) => ({ question: input.question }),
    extractPlan: (steps) => {
      const planStep = steps.plan as { status: string; output?: { plan?: unknown } } | undefined;
      return planStep?.status === 'success' ? planStep.output?.plan : undefined;
    },
    approveStepId: 'approve',
  });
}

function makeCtx(approvalDecision: ApprovalDecision = { kind: 'approve' }): ExecutionContext {
  return {
    runId: 'r-1',
    settings: {},
    memory: null,
    signal: new AbortController().signal,
    approvals: { request: () => Promise.resolve(approvalDecision) },
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
      child() {
        return this;
      },
    },
  };
}

describe('fromMastraWorkflow', () => {
  it('yields plan.proposed when workflow suspends', async () => {
    const capability = makeCapability(buildModel());
    const events: StreamEventPayload[] = [];

    for await (const event of capability.execute({ question: 'What is X?' }, makeCtx())) {
      events.push(event);
    }

    const planProposed = events.find((e) => e.type === 'plan.proposed');
    expect(planProposed).toBeDefined();
    if (planProposed?.type === 'plan.proposed') {
      const plan = planProposed.plan as { summary: string };
      expect(plan.summary).toBe('Test plan');
    }
  });

  it('yields artifact with result after approval', async () => {
    const capability = makeCapability(buildModel());
    const events: StreamEventPayload[] = [];

    for await (const event of capability.execute({ question: 'What is X?' }, makeCtx())) {
      events.push(event);
    }

    const artifact = events.find((e) => e.type === 'artifact');
    expect(artifact).toBeDefined();
    if (artifact?.type === 'artifact') {
      const result = artifact.data as { reportText?: string };
      expect(result.reportText).toBeDefined();
    }
  });

  it('stops after rejection without producing artifact', async () => {
    const capability = makeCapability(buildModel());
    const events: StreamEventPayload[] = [];
    const ctx = makeCtx({ kind: 'reject', reason: 'bad plan' });

    for await (const event of capability.execute({ question: 'What is X?' }, ctx)) {
      events.push(event);
    }

    const planProposed = events.find((e) => e.type === 'plan.proposed');
    expect(planProposed).toBeDefined();

    const artifact = events.find((e) => e.type === 'artifact');
    expect(artifact).toBeUndefined();
  });

  it('exposes capability metadata', () => {
    const capability = makeCapability(buildModel());
    expect(capability.id).toBe('deep-research');
    expect(capability.supportsApproval).toBe(true);
  });
});
