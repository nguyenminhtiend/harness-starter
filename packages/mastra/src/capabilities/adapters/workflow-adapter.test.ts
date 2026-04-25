import { describe, expect, it } from 'bun:test';
import type { StreamEventPayload } from '@harness/core';
import { fakeCtx } from './testing.ts';
import { workflowAdapter } from './workflow-adapter.ts';

describe('workflowAdapter', () => {
  it('yields artifact when workflow succeeds without suspension', async () => {
    const runner = workflowAdapter({
      build: () =>
        ({
          createRun: async () => ({
            start: async () => ({ status: 'success', result: { answer: 42 } }),
          }),
        }) as never,
      extractInput: (input) => input as Record<string, unknown>,
    });

    const events: StreamEventPayload[] = [];
    for await (const e of runner({ q: 'test' }, fakeCtx())) {
      events.push(e);
    }

    expect(events).toEqual([{ type: 'artifact', name: 'result', data: { answer: 42 } }]);
  });

  it('yields plan.proposed and waits for approval on suspended workflow', async () => {
    let approvalPayload: unknown;
    const runner = workflowAdapter({
      build: () =>
        ({
          createRun: async () => ({
            start: async () => ({
              status: 'suspended',
              steps: { plan: { status: 'success', output: { plan: ['sub1'] } } },
            }),
            resume: async () => ({ status: 'success', result: { report: 'done' } }),
          }),
        }) as never,
      extractInput: () => ({}),
      extractPlan: (steps) => {
        const ps = steps.plan as { output?: { plan?: unknown } };
        return ps?.output?.plan;
      },
      approveStepId: 'approve',
    });

    const ctx = fakeCtx({
      approvals: {
        request: async (_id, payload) => {
          approvalPayload = payload;
          return { kind: 'approve' };
        },
      },
    });

    const events: StreamEventPayload[] = [];
    for await (const e of runner({}, ctx)) {
      events.push(e);
    }

    expect(events.map((e) => e.type)).toEqual(['step.finished', 'plan.proposed', 'artifact']);
    expect(approvalPayload).toEqual(['sub1']);
  });

  it('stops after rejection without yielding artifact', async () => {
    const runner = workflowAdapter({
      build: () =>
        ({
          createRun: async () => ({
            start: async () => ({ status: 'suspended', steps: {} }),
            resume: async () => ({ status: 'success', result: {} }),
          }),
        }) as never,
      extractInput: () => ({}),
    });

    const ctx = fakeCtx({
      approvals: {
        request: async () => ({ kind: 'reject', reason: 'no' }),
      },
    });

    const events: StreamEventPayload[] = [];
    for await (const e of runner({}, ctx)) {
      events.push(e);
    }

    expect(events.map((e) => e.type)).toEqual(['step.finished', 'plan.proposed']);
  });

  it('throws when workflow fails', async () => {
    const runner = workflowAdapter({
      build: () =>
        ({
          createRun: async () => ({
            start: async () => ({ status: 'failed' }),
          }),
        }) as never,
      extractInput: () => ({}),
    });

    const events: StreamEventPayload[] = [];
    let error: Error | undefined;
    try {
      for await (const e of runner({}, fakeCtx())) {
        events.push(e);
      }
    } catch (err) {
      error = err as Error;
    }

    expect(error?.message).toMatch(/Workflow failed with status: failed/);
  });
});
