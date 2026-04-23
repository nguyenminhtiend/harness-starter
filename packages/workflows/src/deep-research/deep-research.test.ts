import { describe, expect, test } from 'bun:test';
import { mockModel } from '@harness/agents/testing';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { createDeepResearchWorkflow } from './index.ts';

const fakePlan = {
  summary: 'Test plan',
  subquestions: [{ id: 'sq1', question: 'Why?' }],
};

const fakeFinding = {
  subquestionId: 'sq1',
  summary: 'Because reasons',
  sourceUrls: ['https://example.com/a'],
};

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

function buildMastra(model: ReturnType<typeof mockModel>) {
  const wf = createDeepResearchWorkflow({ model });
  return new Mastra({
    workflows: { deepResearch: wf },
    storage: new LibSQLStore({ id: 'test', url: 'file::memory:?cache=shared' }),
  });
}

describe('deepResearchWorkflow', () => {
  test('suspends after plan step awaiting approval', async () => {
    const model = buildModel();
    const mastra = buildMastra(model);
    const wf = mastra.getWorkflow('deepResearch');
    const run = await wf.createRun();
    const result = await run.start({ inputData: { question: 'What is X?' } });

    expect(result.status).toBe('suspended');
    if (result.status === 'suspended') {
      expect(result.steps.plan?.status).toBe('success');
    }
  });

  test('runs end-to-end when resumed with approval', async () => {
    const model = buildModel();
    const mastra = buildMastra(model);
    const wf = mastra.getWorkflow('deepResearch');
    const run = await wf.createRun();
    const initial = await run.start({ inputData: { question: 'What is X?' } });

    expect(initial.status).toBe('suspended');

    const resumed = await run.resume({
      step: 'approve',
      resumeData: { approved: true },
    });

    expect(resumed.status).toBe('success');
    if (resumed.status === 'success') {
      expect(resumed.result.reportText).toContain('# Report');
      expect(resumed.result.factCheckPassed).toBe(true);
    }
  });
});
