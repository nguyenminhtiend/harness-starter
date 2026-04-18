import type {
  EventBus,
  HarnessError,
  Message,
  Provider,
  RunInput,
  RunResult,
  StreamEvent,
  Usage,
} from '@harness/core';
import type { ZodType } from 'zod';

// Re-export for convenience
export type { RunInput, RunResult };

// --- Agent ---

export interface Agent {
  run(input: RunInput, opts?: RunOptions): Promise<RunResult>;
  stream(input: RunInput, opts?: RunOptions): AsyncIterable<AgentEvent>;
}

export interface RunOptions {
  signal?: AbortSignal;
  runId?: string;
}

export interface RunContext {
  runId: string;
  conversationId: string;
  signal: AbortSignal;
  bus?: EventBus | undefined;
}

// --- Tool ---

export interface ToolContext {
  runId: string;
  conversationId: string;
  signal: AbortSignal;
}

export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  parameters: ZodType<I>;
  execute(args: I, ctx: ToolContext): Promise<O>;
  requireApproval?: 'always' | 'never' | ((args: I) => boolean);
}

// --- Agent Config ---

export interface AgentConfig {
  provider: Provider;
  systemPrompt?: string | ((ctx: RunContext) => string);
  tools?: Tool[];
  memory?: ConversationStore;
  compactor?: Compactor;
  checkpointer?: Checkpointer;
  guardrails?: { input?: InputHook[]; output?: OutputHook[] };
  events?: EventBus;
  maxTurns?: number;
  budgets?: { usd?: number; tokens?: number };
  retryPolicy?: Partial<import('@harness/core').RetryPolicy>;
}

// --- ConversationStore ---

export interface ConversationStore {
  load(conversationId: string): Promise<Message[]>;
  append(conversationId: string, messages: Message[]): Promise<void>;
}

// --- Compactor ---

export interface CompactionContext {
  provider: Provider;
  runId: string;
  signal: AbortSignal;
}

export interface Compactor {
  compact(messages: Message[], ctx: CompactionContext): Promise<Message[]>;
}

// --- Checkpointer ---

export interface RunState {
  runId: string;
  conversationId: string;
  turn: number;
  messages: Message[];
  pendingApprovals?: PendingApproval[];
  graphState?: unknown;
  [key: string]: unknown;
}

export interface CheckpointRef {
  runId: string;
  turn: number;
  createdAt: string;
}

export interface Checkpointer {
  save(runId: string, state: RunState): Promise<void>;
  load(runId: string): Promise<RunState | null>;
  list(conversationId: string): Promise<CheckpointRef[]>;
}

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  args: unknown;
}

// --- Approval ---

export type ApprovalDecision =
  | { approve: true }
  | { approve: false; reason?: string }
  | { approve: true; modifiedArgs: unknown };

export interface ApprovalResolver {
  resolve(approvalId: string, decision: ApprovalDecision): void;
}

// --- Guardrails ---

export type InputHook = (input: {
  messages: Message[];
  ctx: RunContext;
}) => Promise<
  | { action: 'pass' }
  | { action: 'block'; reason: string }
  | { action: 'rewrite'; messages: Message[] }
>;

export type OutputHook = (output: {
  message: Message;
  ctx: RunContext;
}) => Promise<
  { action: 'pass' } | { action: 'block'; reason: string } | { action: 'rewrite'; message: Message }
>;

// --- AgentEvent ---

export type AgentEvent =
  | StreamEvent
  | { type: 'turn-start'; turn: number }
  | { type: 'tool-start'; id: string; name: string; args: unknown }
  | { type: 'tool-approval-required'; id: string; name: string; args: unknown }
  | { type: 'tool-result'; id: string; result: unknown; durationMs: number }
  | { type: 'tool-error'; id: string; error: HarnessError }
  | { type: 'compaction'; droppedTurns: number; summaryTokens: number }
  | { type: 'structured.repair'; attempt: number; issues: unknown }
  | { type: 'guardrail-blocked'; phase: 'input' | 'output'; reason: string }
  | { type: 'handoff'; from: string; to: string }
  | { type: 'checkpoint'; runId: string; turn: number }
  | { type: 'budget.exceeded'; kind: 'usd' | 'tokens'; spent: number; limit: number }
  | { type: 'abort'; reason?: string };

// --- Internal loop hooks (filled by sub-phases 2b–2e) ---

export interface LoopHooks {
  compact?(messages: Message[], ctx: CompactionContext): Promise<Message[]>;
  insertCacheBreakpoints?(messages: Message[], provider: Provider): Message[];
  checkBudget?(): void;
  updateBudget?(usage: Usage): void;
  runInputGuardrails?(messages: Message[], ctx: RunContext): Promise<Message[]>;
  runOutputGuardrails?(message: Message, ctx: RunContext): Promise<Message>;
  saveCheckpoint?(state: RunState): Promise<void>;
  loadCheckpoint?(runId: string): Promise<RunState | null>;
  waitForApproval?(approvalId: string, toolName: string, args: unknown): Promise<ApprovalDecision>;
}

// --- Subagent / Handoff / Graph types (used by 2f-2h) ---

export interface SubagentSpec {
  name: string;
  description: string;
  budget?: { usd?: number; tokens?: number };
}

export interface HandoffState {
  messages?: Message[];
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  agent?: Agent;
  fn?: (state: Record<string, unknown>, ctx: RunContext) => Promise<Record<string, unknown>>;
}

export interface GraphEdge {
  from: string;
  to: string | ((state: Record<string, unknown>) => string);
}

export interface GraphDef {
  nodes: GraphNode[];
  edges: GraphEdge[];
  entryNode: string;
  checkpointer?: Checkpointer;
}
