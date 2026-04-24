import type { ApprovalDecision } from './approval.ts';
import type { CapabilityEvent } from './capability.ts';
import { InvalidRunStateError } from './errors.ts';
import type { ErrorShape, SessionEvent } from './session-event.ts';

export type RunStatus = 'pending' | 'running' | 'suspended' | 'completed' | 'failed' | 'cancelled';

export interface RunSnapshot {
  readonly id: string;
  readonly capabilityId: string;
  readonly status: RunStatus;
  readonly createdAt: string;
  readonly startedAt?: string | undefined;
  readonly finishedAt?: string | undefined;
  readonly conversationId?: string | undefined;
}

const VALID_TRANSITIONS: Record<RunStatus, Set<RunStatus>> = {
  pending: new Set<RunStatus>(['running']),
  running: new Set<RunStatus>(['suspended', 'completed', 'failed', 'cancelled']),
  suspended: new Set<RunStatus>(['running', 'cancelled']),
  completed: new Set<RunStatus>(),
  failed: new Set<RunStatus>(),
  cancelled: new Set<RunStatus>(),
};

export class Run {
  readonly id: string;
  readonly capabilityId: string;
  readonly createdAt: string;
  readonly conversationId?: string | undefined;

  private _status: RunStatus = 'pending';
  private _seq = 0;
  private _startedAt?: string | undefined;
  private _finishedAt?: string | undefined;

  constructor(id: string, capabilityId: string, createdAt: string, conversationId?: string) {
    this.id = id;
    this.capabilityId = capabilityId;
    this.createdAt = createdAt;
    this.conversationId = conversationId;
  }

  get status(): RunStatus {
    return this._status;
  }

  get seq(): number {
    return this._seq;
  }

  start(input: unknown, ts: string): SessionEvent {
    this.transition('running', 'start');
    this._startedAt = ts;
    return this.emit(ts, {
      type: 'run.started' as const,
      capabilityId: this.capabilityId,
      input,
    });
  }

  append(event: CapabilityEvent, ts: string): SessionEvent {
    this.assertStatus('running', 'append');
    const mapped = mapCapabilityEvent(event);
    return this.emit(ts, mapped);
  }

  suspendForApproval(approvalId: string, payload: unknown, ts: string): SessionEvent {
    this.transition('suspended', 'suspendForApproval');
    return this.emit(ts, {
      type: 'approval.requested' as const,
      approvalId,
      payload,
    });
  }

  resumeFromApproval(approvalId: string, decision: ApprovalDecision, ts: string): SessionEvent {
    this.transition('running', 'resumeFromApproval');
    return this.emit(ts, {
      type: 'approval.resolved' as const,
      approvalId,
      decision,
    });
  }

  complete(output: unknown, ts: string): SessionEvent {
    this.transition('completed', 'complete');
    this._finishedAt = ts;
    return this.emit(ts, { type: 'run.completed' as const, output });
  }

  fail(error: ErrorShape, ts: string): SessionEvent {
    this.transition('failed', 'fail');
    this._finishedAt = ts;
    return this.emit(ts, { type: 'run.failed' as const, error });
  }

  cancel(reason: string | undefined, ts: string): SessionEvent {
    this.transition('cancelled', 'cancel');
    this._finishedAt = ts;
    return this.emit(ts, { type: 'run.cancelled' as const, reason });
  }

  snapshot(): RunSnapshot {
    return {
      id: this.id,
      capabilityId: this.capabilityId,
      status: this._status,
      createdAt: this.createdAt,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      conversationId: this.conversationId,
    };
  }

  private transition(to: RunStatus, action: string): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed?.has(to)) {
      throw new InvalidRunStateError(this._status, action);
    }
    this._status = to;
  }

  private assertStatus(expected: RunStatus, action: string): void {
    if (this._status !== expected) {
      throw new InvalidRunStateError(this._status, action);
    }
  }

  private emit(ts: string, payload: Record<string, unknown>): SessionEvent {
    const event = {
      runId: this.id,
      seq: this._seq,
      ts,
      ...payload,
    } as SessionEvent;
    this._seq++;
    return event;
  }
}

function mapCapabilityEvent(e: CapabilityEvent): Record<string, unknown> {
  switch (e.type) {
    case 'text-delta':
      return { type: 'text.delta', text: e.text };
    case 'reasoning-delta':
      return { type: 'reasoning.delta', text: e.text };
    case 'tool-called':
      return { type: 'tool.called', tool: e.tool, args: e.args, callId: e.callId };
    case 'tool-result':
      return { type: 'tool.result', callId: e.callId, result: e.result };
    case 'step-finished':
      return { type: 'step.finished', usage: e.usage };
    case 'plan-proposed':
      return { type: 'plan.proposed', plan: e.plan };
    case 'artifact':
      return { type: 'artifact', name: e.name, data: e.data };
    case 'usage':
      return { type: 'usage', usage: e.usage };
    case 'custom':
      return { type: 'artifact', name: e.kind, data: e.data };
  }
}
