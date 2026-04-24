import { describe, expect, it } from 'bun:test';
import { mockModel } from '@harness/agents/testing';
import { createDeepResearchWorkflow } from '@harness/workflows';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { z } from 'zod';
import { fromMastraWorkflow } from './from-workflow.ts';

const fakePlan = {
  summary: 'Test plan',
  subquestions: [{ id: 'sq1', question: 'Why?' }],
};

function buildModel() {
  return mockModel([
    { type: 'text', text: JSON.stringify(fakePlan) },
    {
      type: 'text',
      text: JSON.stringify({ subquestionId: 'sq1', summary: 'Because', sourceUrls: [] }),
    },
    { type: 'text', text: JSON.stringify({ title: 'Report', sections: [], references: [] }) },
    { type: 'text', text: JSON.stringify({ pass: true, issues: [] }) },
  ]);
}

describe('fromMastraWorkflow', () => {
  it('produces a CapabilityDefinition with workflow runner', () => {
    const model = buildModel();
    const cap = fromMastraWorkflow({
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

    expect(cap.id).toBe('deep-research');
    expect(cap.title).toBe('Deep Research');
    expect(cap.supportsApproval).toBe(true);
    expect(cap.runner.kind).toBe('workflow');
  });

  it('runner.build returns a workflow and runner.extractInput extracts input', () => {
    const model = buildModel();
    const cap = fromMastraWorkflow({
      id: 'deep-research',
      title: 'Deep Research',
      description: 'Research',
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
      extractPlan: () => undefined,
      approveStepId: 'approve',
    });

    if (cap.runner.kind === 'workflow') {
      const wf = cap.runner.build({});
      expect(wf).toBeDefined();
      expect(cap.runner.extractInput({ question: 'What is X?' })).toEqual({
        question: 'What is X?',
      });
      expect(cap.runner.approveStepId).toBe('approve');
    }
  });
});
