import { describe, expect, test } from 'bun:test';
import { mockModel } from '@harness/agents/testing';
import type { ApprovalDecision, ExecutionContext, StreamEventPayload } from '@harness/core';
import { deepResearchCapability } from './capability.ts';

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

function fakeCtx(
  approvalDecision: ApprovalDecision = { kind: 'approve' },
  overrides?: Partial<ExecutionContext>,
): ExecutionContext {
  return {
    runId: 'run-1',
    settings: { model: 'ollama:test:latest' },
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
    ...overrides,
  };
}

async function collectEvents(
  iter: AsyncIterable<StreamEventPayload>,
): Promise<StreamEventPayload[]> {
  const events: StreamEventPayload[] = [];
  for await (const e of iter) {
    events.push(e);
  }
  return events;
}

describe('deepResearchCapability', () => {
  test('has correct metadata', () => {
    expect(deepResearchCapability.id).toBe('deep-research');
    expect(deepResearchCapability.title).toBe('Deep Research');
    expect(deepResearchCapability.supportsApproval).toBe(true);
  });

  test('inputSchema validates correct input', () => {
    const result = deepResearchCapability.inputSchema.safeParse({
      question: 'What is quantum computing?',
    });
    expect(result.success).toBe(true);
  });

  test('inputSchema rejects empty question', () => {
    const result = deepResearchCapability.inputSchema.safeParse({
      question: '',
    });
    expect(result.success).toBe(false);
  });

  test('settingsSchema validates correct settings', () => {
    const result = deepResearchCapability.settingsSchema.safeParse({
      model: 'ollama:qwen2.5:3b',
      depth: 'basic',
    });
    expect(result.success).toBe(true);
  });

  test('yields plan.proposed and artifact after approval', async () => {
    const model = buildModel();
    const cap = deepResearchCapability.__createWithModel(model);
    const events = await collectEvents(cap.execute({ question: 'What is X?' }, fakeCtx()));

    const planProposed = events.find((e) => e.type === 'plan.proposed');
    expect(planProposed).toBeDefined();
    if (planProposed?.type === 'plan.proposed') {
      const plan = planProposed.plan as { summary: string };
      expect(plan.summary).toBe('Test plan');
    }

    const artifact = events.find((e) => e.type === 'artifact');
    expect(artifact).toBeDefined();
    if (artifact?.type === 'artifact') {
      const data = artifact.data as { reportText?: string };
      expect(data.reportText).toBeDefined();
    }
  });

  test('stops after rejection without producing artifact', async () => {
    const model = buildModel();
    const cap = deepResearchCapability.__createWithModel(model);
    const ctx = fakeCtx({ kind: 'reject', reason: 'bad plan' });
    const events = await collectEvents(cap.execute({ question: 'What is X?' }, ctx));

    const planProposed = events.find((e) => e.type === 'plan.proposed');
    expect(planProposed).toBeDefined();

    const artifact = events.find((e) => e.type === 'artifact');
    expect(artifact).toBeUndefined();
  });
});
