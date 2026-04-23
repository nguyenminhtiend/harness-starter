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

/**
 * LLM-level visibility: request/response/thinking/tool-call.
 * - `request`: messages sent to the provider for a turn
 * - `response`: aggregated assistant text for a turn
 * - `thinking`: reasoning/chain-of-thought delta
 * - `tool-call`: tool call issued by the model (distinct from tool execution in ToolEvent)
 */
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

/** Graph node lifecycle: mirrors `handoff` but with explicit start/end semantics. */
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
