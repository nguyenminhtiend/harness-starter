export type {
  AgentPhaseEvent,
  CompleteEvent,
  ErrorEvent,
  HitlRequiredEvent,
  HitlResolvedEvent,
  MetricEvent,
  SessionMeta,
  SessionStatus,
  StatusEvent,
  ToolEvent,
  UIEventBase,
  WriterEvent,
} from '@harness/session-events';

import type { UIEvent as BaseUIEvent, UIEventBase } from '@harness/session-events';

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

export interface FactCheckerEvent extends UIEventBase {
  type: 'factchecker';
  verdict?: 'pass' | 'fail' | 'retry';
  reason?: string;
}

export type UIEvent = BaseUIEvent | PlannerEvent | ResearcherEvent | FactCheckerEvent;
