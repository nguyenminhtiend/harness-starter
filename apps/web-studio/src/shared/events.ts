export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SessionMeta {
  id: string;
  toolId: string;
  question: string;
  status: SessionStatus;
  conversationId?: string;
  createdAt: string;
  finishedAt?: string;
}

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
  callId?: string;
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

export interface LlmMessage {
  role: string;
  content: unknown;
}

export interface LlmEvent extends UIEventBase {
  type: 'llm';
  phase: 'request' | 'response' | 'thinking' | 'tool-call';
  providerId?: string;
  turn?: number;
  messages?: LlmMessage[];
  text?: string;
  toolName?: string;
  callId?: string;
  args?: unknown;
}

export interface NodeEvent extends UIEventBase {
  type: 'node';
  phase: 'start' | 'end';
  node: string;
  from?: string;
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
  | WriterEvent
  | LlmEvent
  | NodeEvent;
