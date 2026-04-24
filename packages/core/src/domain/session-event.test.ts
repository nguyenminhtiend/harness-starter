import { describe, expect, it } from 'bun:test';
import { SessionEvent } from './session-event.ts';

const base = {
  runId: '550e8400-e29b-41d4-a716-446655440000',
  seq: 0,
  ts: '2026-04-24T00:00:00Z',
};

const allVariants: Record<string, unknown> = {
  'run.started': {
    ...base,
    type: 'run.started',
    capabilityId: 'simple-chat',
    input: { msg: 'hi' },
  },
  'text.delta': { ...base, type: 'text.delta', seq: 1, text: 'Hello' },
  'reasoning.delta': { ...base, type: 'reasoning.delta', seq: 2, text: 'Thinking...' },
  'tool.called': {
    ...base,
    type: 'tool.called',
    seq: 3,
    tool: 'calculator',
    args: { expr: '1+1' },
    callId: 'call-1',
  },
  'tool.result': { ...base, type: 'tool.result', seq: 4, callId: 'call-1', result: 2 },
  'step.finished': { ...base, type: 'step.finished', seq: 5 },
  'step.finished with usage': {
    ...base,
    type: 'step.finished',
    seq: 5,
    usage: { inputTokens: 10, outputTokens: 5 },
  },
  'plan.proposed': { ...base, type: 'plan.proposed', seq: 6, plan: { steps: ['a', 'b'] } },
  'approval.requested': {
    ...base,
    type: 'approval.requested',
    seq: 7,
    approvalId: 'apr-1',
    payload: { plan: 'do stuff' },
  },
  'approval.resolved (approve)': {
    ...base,
    type: 'approval.resolved',
    seq: 8,
    approvalId: 'apr-1',
    decision: { kind: 'approve' },
  },
  'approval.resolved (reject)': {
    ...base,
    type: 'approval.resolved',
    seq: 8,
    approvalId: 'apr-1',
    decision: { kind: 'reject', reason: 'bad plan' },
  },
  artifact: { ...base, type: 'artifact', seq: 9, name: 'report', data: { html: '<p>hi</p>' } },
  usage: {
    ...base,
    type: 'usage',
    seq: 10,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  },
  'run.completed': { ...base, type: 'run.completed', seq: 11, output: { result: 'done' } },
  'run.failed': {
    ...base,
    type: 'run.failed',
    seq: 12,
    error: { code: 'CAPABILITY_EXECUTION_ERROR', message: 'boom' },
  },
  'run.cancelled': { ...base, type: 'run.cancelled', seq: 13, reason: 'user cancelled' },
  'run.cancelled (no reason)': { ...base, type: 'run.cancelled', seq: 13 },
};

describe('SessionEvent schema', () => {
  for (const [label, data] of Object.entries(allVariants)) {
    it(`parses variant: ${label}`, () => {
      const result = SessionEvent.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });
  }

  it('round-trips every variant through JSON', () => {
    for (const [_label, data] of Object.entries(allVariants)) {
      const json = JSON.stringify(data);
      const parsed = SessionEvent.parse(JSON.parse(json));
      expect(parsed).toEqual(data);
    }
  });

  it('rejects invalid runId (not UUID)', () => {
    const result = SessionEvent.safeParse({
      ...base,
      runId: 'not-a-uuid',
      type: 'text.delta',
      text: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative seq', () => {
    const result = SessionEvent.safeParse({ ...base, seq: -1, type: 'text.delta', text: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown event type', () => {
    const result = SessionEvent.safeParse({ ...base, type: 'unknown.type' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = SessionEvent.safeParse({ type: 'text.delta', text: 'x' });
    expect(result.success).toBe(false);
  });
});
