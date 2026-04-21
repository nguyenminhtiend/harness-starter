import type { SessionStatus } from '@harness/session-store';

export type { SessionRow as SessionMeta } from '@harness/session-store';
export type { SessionStatus };

export interface UIEventBase {
  ts: number;
  runId: string;
}

export interface StatusEvent extends UIEventBase {
  type: 'status';
  status: SessionStatus;
}

export interface ToolEvent extends UIEventBase {
  type: 'tool';
  toolName: string;
  args?: unknown;
  result?: string;
  durationMs?: number;
  isError?: boolean;
}

export interface AgentPhaseEvent extends UIEventBase {
  type: 'agent';
  phase: string;
  message?: string;
}

export interface MetricEvent extends UIEventBase {
  type: 'metric';
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export interface CompleteEvent extends UIEventBase {
  type: 'complete';
  report?: string;
  totalTokens: number;
  totalCostUsd?: number;
}

export interface ErrorEvent extends UIEventBase {
  type: 'error';
  message: string;
  code?: string;
}

export interface HitlRequiredEvent extends UIEventBase {
  type: 'hitl-required';
  plan: unknown;
}

export interface HitlResolvedEvent extends UIEventBase {
  type: 'hitl-resolved';
  decision: 'approve' | 'reject';
  editedPlan?: unknown;
}

export interface WriterEvent extends UIEventBase {
  type: 'writer';
  delta?: string;
}

export type UIEvent =
  | StatusEvent
  | ToolEvent
  | AgentPhaseEvent
  | MetricEvent
  | CompleteEvent
  | ErrorEvent
  | HitlRequiredEvent
  | HitlResolvedEvent
  | WriterEvent;
