export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface UIEventBase {
  ts: number;
  runId: string;
}

export interface PlannerEvent extends UIEventBase {
  type: 'planner';
  subquestions: string[];
}

export interface ResearcherEvent extends UIEventBase {
  type: 'researcher';
  subquestion: string;
  toolName: string;
  args?: unknown;
  result?: string;
}

export interface WriterEvent extends UIEventBase {
  type: 'writer';
  delta?: string;
}

export interface FactCheckerEvent extends UIEventBase {
  type: 'factchecker';
  verdict?: 'pass' | 'fail' | 'retry';
  reason?: string;
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
}

export interface StatusEvent extends UIEventBase {
  type: 'status';
  status: RunStatus;
}

export type UIEvent =
  | PlannerEvent
  | ResearcherEvent
  | WriterEvent
  | FactCheckerEvent
  | ToolEvent
  | AgentPhaseEvent
  | MetricEvent
  | CompleteEvent
  | ErrorEvent
  | HitlRequiredEvent
  | HitlResolvedEvent
  | StatusEvent;

export interface RunMeta {
  id: string;
  toolId: string;
  question: string;
  status: RunStatus;
  costUsd?: number;
  totalTokens?: number;
  createdAt: string;
  finishedAt?: string;
}
