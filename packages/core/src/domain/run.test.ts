import { describe, expect, it } from 'bun:test';
import { InvalidRunStateError } from './errors.ts';
import { Run } from './run.ts';
import type { StreamEventPayload } from './session-event.ts';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const CAPABILITY_ID = 'simple-chat';
const TS = '2026-04-24T00:00:00.000Z';

function createRun() {
  return new Run(RUN_ID, CAPABILITY_ID, TS);
}

describe('Run', () => {
  describe('initial state', () => {
    it('starts as pending with seq 0', () => {
      const run = createRun();
      expect(run.id).toBe(RUN_ID);
      expect(run.capabilityId).toBe(CAPABILITY_ID);
      expect(run.status).toBe('pending');
      expect(run.seq).toBe(0);
    });
  });

  describe('start()', () => {
    it('transitions pending → running and emits run.started', () => {
      const run = createRun();
      const event = run.start({ message: 'hi' }, TS);

      expect(run.status).toBe('running');
      expect(event.type).toBe('run.started');
      expect(event.runId).toBe(RUN_ID);
      expect(event.seq).toBe(0);
      if (event.type === 'run.started') {
        expect(event.capabilityId).toBe(CAPABILITY_ID);
        expect(event.input).toEqual({ message: 'hi' });
      }
    });

    it('throws from running state', () => {
      const run = createRun();
      run.start({}, TS);
      expect(() => run.start({}, TS)).toThrow(InvalidRunStateError);
    });

    it('throws from completed state', () => {
      const run = createRun();
      run.start({}, TS);
      run.complete('done', TS);
      expect(() => run.start({}, TS)).toThrow(InvalidRunStateError);
    });
  });

  describe('append()', () => {
    it('wraps a StreamEventPayload into a SessionEvent with incrementing seq', () => {
      const run = createRun();
      run.start({ msg: 'hi' }, TS);

      const payload: StreamEventPayload = { type: 'text.delta', text: 'Hello' };
      const sessionEvent = run.append(payload, TS);

      expect(sessionEvent.type).toBe('text.delta');
      expect(sessionEvent.runId).toBe(RUN_ID);
      expect(sessionEvent.seq).toBe(1);
      if (sessionEvent.type === 'text.delta') {
        expect(sessionEvent.text).toBe('Hello');
      }
    });

    it('passes through all StreamEventPayload types', () => {
      const run = createRun();
      run.start({}, TS);

      const events: StreamEventPayload[] = [
        { type: 'text.delta', text: 'a' },
        { type: 'reasoning.delta', text: 'b' },
        { type: 'tool.called', tool: 'calc', args: {}, callId: 'c1' },
        { type: 'tool.result', callId: 'c1', result: 42 },
        { type: 'step.finished', usage: { inputTokens: 10 } },
        { type: 'plan.proposed', plan: { steps: [] } },
        { type: 'artifact', name: 'report', data: {} },
        { type: 'usage', usage: { totalTokens: 20 } },
      ];

      const sessionTypes = events.map((e) => run.append(e, TS).type);
      expect(sessionTypes).toEqual([
        'text.delta',
        'reasoning.delta',
        'tool.called',
        'tool.result',
        'step.finished',
        'plan.proposed',
        'artifact',
        'usage',
      ]);
    });

    it('increments seq monotonically', () => {
      const run = createRun();
      run.start({}, TS);

      const seqs = [
        run.append({ type: 'text.delta', text: 'a' }, TS).seq,
        run.append({ type: 'text.delta', text: 'b' }, TS).seq,
        run.append({ type: 'text.delta', text: 'c' }, TS).seq,
      ];
      expect(seqs).toEqual([1, 2, 3]);
    });

    it('throws when not running', () => {
      const run = createRun();
      expect(() => run.append({ type: 'text.delta', text: 'x' }, TS)).toThrow(InvalidRunStateError);
    });
  });

  describe('suspendForApproval()', () => {
    it('transitions running → suspended and emits approval.requested', () => {
      const run = createRun();
      run.start({}, TS);
      const event = run.suspendForApproval('apr-1', { plan: 'do stuff' }, TS);

      expect(run.status).toBe('suspended');
      expect(event.type).toBe('approval.requested');
      if (event.type === 'approval.requested') {
        expect(event.approvalId).toBe('apr-1');
        expect(event.payload).toEqual({ plan: 'do stuff' });
      }
    });

    it('throws from pending state', () => {
      const run = createRun();
      expect(() => run.suspendForApproval('apr-1', {}, TS)).toThrow(InvalidRunStateError);
    });
  });

  describe('resumeFromApproval()', () => {
    it('transitions suspended → running and emits approval.resolved', () => {
      const run = createRun();
      run.start({}, TS);
      run.suspendForApproval('apr-1', {}, TS);

      const event = run.resumeFromApproval('apr-1', { kind: 'approve' }, TS);

      expect(run.status).toBe('running');
      expect(event.type).toBe('approval.resolved');
      if (event.type === 'approval.resolved') {
        expect(event.approvalId).toBe('apr-1');
        expect(event.decision).toEqual({ kind: 'approve' });
      }
    });

    it('handles reject decision', () => {
      const run = createRun();
      run.start({}, TS);
      run.suspendForApproval('apr-1', {}, TS);

      const event = run.resumeFromApproval('apr-1', { kind: 'reject', reason: 'nope' }, TS);

      if (event.type === 'approval.resolved') {
        expect(event.decision).toEqual({ kind: 'reject', reason: 'nope' });
      }
    });

    it('throws from running state', () => {
      const run = createRun();
      run.start({}, TS);
      expect(() => run.resumeFromApproval('apr-1', { kind: 'approve' }, TS)).toThrow(
        InvalidRunStateError,
      );
    });
  });

  describe('complete()', () => {
    it('transitions running → completed and emits run.completed', () => {
      const run = createRun();
      run.start({}, TS);
      const event = run.complete({ result: 'done' }, TS);

      expect(run.status).toBe('completed');
      expect(event.type).toBe('run.completed');
      if (event.type === 'run.completed') {
        expect(event.output).toEqual({ result: 'done' });
      }
    });

    it('throws from pending state', () => {
      const run = createRun();
      expect(() => run.complete('done', TS)).toThrow(InvalidRunStateError);
    });

    it('throws from completed state (idempotent not allowed)', () => {
      const run = createRun();
      run.start({}, TS);
      run.complete('done', TS);
      expect(() => run.complete('done', TS)).toThrow(InvalidRunStateError);
    });
  });

  describe('fail()', () => {
    it('transitions running → failed and emits run.failed', () => {
      const run = createRun();
      run.start({}, TS);
      const event = run.fail({ code: 'ERR', message: 'boom' }, TS);

      expect(run.status).toBe('failed');
      expect(event.type).toBe('run.failed');
      if (event.type === 'run.failed') {
        expect(event.error).toEqual({ code: 'ERR', message: 'boom' });
      }
    });

    it('throws from pending state', () => {
      const run = createRun();
      expect(() => run.fail({ code: 'ERR', message: 'boom' }, TS)).toThrow(InvalidRunStateError);
    });
  });

  describe('cancel()', () => {
    it('transitions running → cancelled and emits run.cancelled', () => {
      const run = createRun();
      run.start({}, TS);
      const event = run.cancel('user requested', TS);

      expect(run.status).toBe('cancelled');
      expect(event.type).toBe('run.cancelled');
      if (event.type === 'run.cancelled') {
        expect(event.reason).toBe('user requested');
      }
    });

    it('transitions suspended → cancelled', () => {
      const run = createRun();
      run.start({}, TS);
      run.suspendForApproval('apr-1', {}, TS);
      const event = run.cancel(undefined, TS);

      expect(run.status).toBe('cancelled');
      expect(event.type).toBe('run.cancelled');
    });

    it('throws from pending state', () => {
      const run = createRun();
      expect(() => run.cancel(undefined, TS)).toThrow(InvalidRunStateError);
    });

    it('throws from completed state', () => {
      const run = createRun();
      run.start({}, TS);
      run.complete('done', TS);
      expect(() => run.cancel(undefined, TS)).toThrow(InvalidRunStateError);
    });

    it('throws from failed state', () => {
      const run = createRun();
      run.start({}, TS);
      run.fail({ code: 'ERR', message: 'x' }, TS);
      expect(() => run.cancel(undefined, TS)).toThrow(InvalidRunStateError);
    });
  });

  describe('full lifecycle', () => {
    it('pending → running → suspended → running → completed', () => {
      const run = createRun();
      run.start({}, TS);
      run.append({ type: 'text.delta', text: 'planning...' }, TS);
      run.suspendForApproval('apr-1', { plan: 'x' }, TS);
      run.resumeFromApproval('apr-1', { kind: 'approve' }, TS);
      run.append({ type: 'text.delta', text: 'executing...' }, TS);
      run.complete({ report: 'done' }, TS);

      expect(run.status).toBe('completed');
    });

    it('produces gap-free monotonic seq across all events', () => {
      const run = createRun();
      const events = [];

      events.push(run.start({}, TS));
      events.push(run.append({ type: 'text.delta', text: 'a' }, TS));
      events.push(run.append({ type: 'text.delta', text: 'b' }, TS));
      events.push(run.suspendForApproval('apr-1', {}, TS));
      events.push(run.resumeFromApproval('apr-1', { kind: 'approve' }, TS));
      events.push(run.append({ type: 'text.delta', text: 'c' }, TS));
      events.push(run.complete('done', TS));

      const seqs = events.map((e) => e.seq);
      expect(seqs).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  describe('snapshot()', () => {
    it('returns a serializable read-model projection', () => {
      const run = createRun();
      run.start({ msg: 'hi' }, TS);

      const snap = run.snapshot();
      expect(snap.id).toBe(RUN_ID);
      expect(snap.capabilityId).toBe(CAPABILITY_ID);
      expect(snap.status).toBe('running');
      expect(snap.createdAt).toBe(TS);
    });
  });
});
