# Harness Starter — Architecture Design

**Status:** Approved — ready for implementation planning
**Date:** 2026-04-17
**Scope:** Monorepo-level architecture spec. Each package gets its own detailed spec when implemented.

## 1. Purpose

Provide a TypeScript-first, clone-and-own starter for building agentic AI systems in 2026. The starter bundles subsystems that work together but are independently usable:

1. **Provider abstraction** — extensible interface for any LLM backend, built on Vercel AI SDK v5, with first-class support for prompt caching, extended thinking, batch APIs, and streaming structured output.
2. **Agent runtime harness** — single-agent loop, hierarchical subagents, peer-to-peer handoff/swarm, and a state-machine graph with durable checkpoints. Tool calling, memory, streaming, compaction, guardrail hooks, human-in-the-loop approvals, and enforceable cost budgets all ride on one loop.
3. **Tooling & sandboxing** — sandboxed workspace-rooted filesystem tool and allowlisted HTTP fetch tool shipped by default.
4. **Eval harness** — Evalite-based DSL (Vitest-powered) with adapters to Inspect-AI log format and Langfuse. CLI wrapper adds model matrices and HTML reports.
5. **MCP adapter** — separate package that wraps any MCP server as `@harness/agent` tools.
6. **Observability** — event bus + OpenTelemetry and Langfuse adapters.

The starter targets app developers, researchers, and platform teams equally. Defaults prioritize a production-credible surface with batteries included for the common cases, while keeping every package swappable or deletable.

## 2. Design decisions (summary)

| Dimension | Choice |
|---|---|
| Shape | Layered modular monorepo with multiple focused packages |
| Distribution | Clone-and-own template repo. Not published to npm. MIT license. |
| Runtime | Node 22+ **and** Bun. `core` uses only Web-standard APIs. |
| Provider core | Vercel AI SDK v5, wrapped by an extensible `Provider` interface |
| Provider features | Prompt caching, extended thinking, batch API, streaming structured output — all first-class |
| Prompt caching | Auto-insert breakpoint after system+tools; `cacheBoundary: true` opt-in elsewhere |
| Agent patterns | Single-loop, hierarchical subagents-as-tools, peer-to-peer handoff, graph/state-machine with checkpoints |
| Durability | First-class checkpointing in `@harness/agent`; SQLite checkpointer default |
| Tools | Zod-based; built-in `fs` (workspace-rooted) + `fetch` (allowlisted) |
| MCP | Separate `@harness/mcp` package — MCP server → harness Tool adapter |
| Monorepo tooling | Bun workspaces (no Turbo/Nx) |
| Memory | Pluggable `ConversationStore`; in-memory + SQLite adapter ship by default |
| Observability | Event bus; OTel + Langfuse adapters |
| Eval | Evalite DSL + Inspect-AI log compat + Langfuse trace export |
| Schema | Zod v4 |
| Tests | `bun test`; `fakeProvider()` for provider-level tests; TDD enforced for `packages/*` |
| Examples | `apps/cli-chat` (OpenRouter default) + `apps/http-server` (Hono, stateless, SSE + AI SDK UIMessage) |
| TS toolchain | TypeScript 5.7+ strict, Biome for lint+format |
| Context management | Pluggable `Compactor`; default summarizes middle with same-family cheapest model |
| Built-ins | AbortSignal cancellation, cost tracking, enforceable budgets, retry with backoff, HITL approvals, structured-output auto-repair |
| Config | `defineConfig()` with Zod-validated schema + env helper |
| Token counting | `gpt-tokenizer` for pre-flight estimates; provider-reported usage otherwise |
| Repo hygiene | Lefthook, Commitlint (Conventional Commits), Changesets, Renovate-friendly |

## 3. Repository layout

```
harness-starter/
├── package.json              # workspace root (bun workspaces)
├── bunfig.toml
├── biome.json
├── lefthook.yml
├── commitlint.config.ts
├── tsconfig.base.json
├── packages/
│   ├── core/                 # @harness/core
│   │   └── src/
│   │       ├── provider/     # Provider interface + AI-SDK-backed impl
│   │       ├── events/       # event bus
│   │       ├── config/       # defineConfig + envConfig
│   │       ├── testing/      # fakeProvider, scripted streams
│   │       ├── errors.ts
│   │       ├── retry.ts
│   │       ├── cost.ts
│   │       ├── abort.ts
│   │       └── index.ts
│   ├── agent/                # @harness/agent
│   │   └── src/
│   │       ├── loop.ts
│   │       ├── tools/        # tool(), subagentAsTool, requireApproval
│   │       ├── handoff/      # peer-to-peer agent transfer
│   │       ├── graph/        # state-machine DSL + checkpointer iface
│   │       ├── memory/       # ConversationStore iface + inMemoryStore
│   │       ├── compaction/   # default keep-last-N + summarize
│   │       ├── budgets/      # cost/token enforcement
│   │       ├── guardrails/   # input/output hook interfaces
│   │       └── index.ts
│   ├── memory-sqlite/        # @harness/memory-sqlite
│   │   └── src/              # SQLite-backed ConversationStore + Checkpointer
│   ├── tools/                # @harness/tools
│   │   └── src/
│   │       ├── fs.ts         # workspace-rooted file read/write/list
│   │       └── fetch.ts      # allowlisted HTTP
│   ├── mcp/                  # @harness/mcp
│   │   └── src/              # MCP client -> harness Tool adapter
│   ├── observability/        # @harness/observability
│   │   └── src/
│   │       ├── otel.ts
│   │       └── langfuse.ts
│   ├── eval/                 # @harness/eval
│   │   └── src/
│   │       ├── dsl.ts        # re-exports evalite + harness helpers
│   │       ├── scorers.ts
│   │       ├── inspect-log.ts # Inspect-AI log format writer
│   │       └── index.ts
│   └── cli/                  # @harness/cli
│       └── src/
│           └── eval.ts       # harness-eval command
├── apps/
│   ├── cli-chat/             # terminal chat agent; OpenRouter default
│   └── http-server/          # Hono server; stateless; SSE + AI SDK UIMessage
└── docs/
    ├── getting-started.md
    ├── architecture.md
    ├── adr/
    ├── extending/
    └── upgrading.md
```

### Dependency direction

Enforced by tsconfig `references` and a Biome `noRestrictedImports` rule.

- `core` depends on nothing internal.
- `agent` imports from `core`.
- `memory-sqlite`, `tools`, `mcp`, `observability` each import from `core` and/or `agent` only.
- `eval` imports from `core` and `agent`.
- `cli` imports from `core`, `agent`, `eval`, `observability`.
- Apps may import from any package.

### Runtime boundary

`core` uses only Web-standard APIs (`fetch`, `ReadableStream`, `AbortSignal`). Node/Bun-specific functionality (SQLite stores, process-level tracing exporters, workspace-rooted fs) lives in sibling packages behind explicit imports.

### Clone-and-own affordances

Each package is a self-contained unit with its own `package.json`, tests, and README. Deleting `packages/eval/`, `packages/mcp/`, `packages/memory-sqlite/`, or `apps/http-server/` leaves the rest of the repo building and testing cleanly. This is a tested success criterion, not just an aspiration.

## 4. Public API surface

### `@harness/core`

```ts
export interface Provider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
  stream(req: GenerateRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  batch?(reqs: GenerateRequest[], signal?: AbortSignal): Promise<BatchHandle>;
}

export interface ProviderCapabilities {
  caching: boolean;          // supports cache breakpoints
  thinking: boolean;         // supports extended thinking
  batch: boolean;            // supports batch API
  structuredStream: boolean; // streams partial JSON validated against schema
}

export interface GenerateRequest {
  messages: Message[];
  tools?: ToolSchema[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ZodType;
  thinking?: { enabled: boolean; budgetTokens?: number };
  cache?: { autoInsert?: boolean };           // default true
}

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessagePart[];
  cacheBoundary?: boolean;                    // manual opt-in cache break
  // ... tool-call / tool-result discriminants as needed
};

export type StreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "thinking-delta"; delta: string }
  | { type: "structured-partial"; path: string; value: unknown }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | { type: "usage"; tokens: Usage; costUSD?: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: "finish"; reason: FinishReason };

export function aiSdkProvider(model: LanguageModel, opts?: ProviderOpts): Provider;

export interface EventBus {
  emit<K extends keyof HarnessEvents>(ev: K, payload: HarnessEvents[K]): void;
  on<K extends keyof HarnessEvents>(ev: K, h: (p: HarnessEvents[K]) => void): () => void;
}
export function createEventBus(): EventBus;

export function defineConfig<S extends ZodType>(schema: S, value: z.input<S>): z.infer<S>;
export function envConfig<S extends ZodType>(schema: S): z.infer<S>;

// @harness/core/testing
export function fakeProvider(script: ScriptedStream[]): Provider;
```

### `@harness/agent`

```ts
export interface Agent {
  run(input: RunInput, opts?: RunOptions): Promise<RunResult>;
  stream(input: RunInput, opts?: RunOptions): AsyncIterable<AgentEvent>;
}

export function createAgent(cfg: AgentConfig): Agent;

export interface AgentConfig {
  provider: Provider;
  systemPrompt?: string | ((ctx: RunContext) => string);
  tools?: Tool[];
  memory?: ConversationStore;
  compactor?: Compactor;
  checkpointer?: Checkpointer;                    // enables resumable runs
  guardrails?: { input?: InputHook[]; output?: OutputHook[] };
  events?: EventBus;
  maxTurns?: number;
  budgets?: { usd?: number; tokens?: number };    // enforced, propagates to subagents
}

export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  parameters: ZodType<I>;
  execute(args: I, ctx: ToolContext): Promise<O>;
  requireApproval?: "always" | "never" | ((args: I) => boolean);
}
export function tool<I, O>(def: Tool<I, O>): Tool<I, O>;

// Composition primitives — all three first-class patterns
export function subagentAsTool(child: Agent, spec: SubagentSpec): Tool;
export function handoff(target: Agent, carry?: HandoffState): Tool;   // peer-to-peer
export function graph(def: GraphDef): Agent;                          // state machine

export interface ConversationStore {
  load(conversationId: string): Promise<Message[]>;
  append(conversationId: string, messages: Message[]): Promise<void>;
}
export function inMemoryStore(): ConversationStore;

export interface Checkpointer {
  save(runId: string, state: RunState): Promise<void>;
  load(runId: string): Promise<RunState | null>;
  list(conversationId: string): Promise<CheckpointRef[]>;
}

export interface Compactor {
  compact(messages: Message[], ctx: CompactionContext): Promise<Message[]>;
}
export function summarizingCompactor(opts?: SummarizingCompactorOpts): Compactor;

// HITL caller-side helper
export interface ApprovalResolver {
  resolve(approvalId: string, decision: ApprovalDecision): void;
}
```

### `@harness/memory-sqlite`

```ts
export function sqliteStore(opts: { path: string }): ConversationStore;
export function sqliteCheckpointer(opts: { path: string }): Checkpointer;
```

### `@harness/tools`

```ts
export function fsTool(opts: { workspace: string; mode?: "ro" | "rw" }): Tool;
export function fetchTool(opts: { allow?: (string | RegExp)[]; deny?: (string | RegExp)[] }): Tool;
```

### `@harness/mcp`

```ts
export async function mcpTools(
  client: McpClientConfig,        // stdio | http | websocket
  opts?: { allow?: string[]; deny?: string[] }
): Promise<Tool[]>;
```

### `@harness/observability`

```ts
export function otelAdapter(bus: EventBus, tracer: Tracer): () => void;
export function langfuseAdapter(bus: EventBus, langfuse: LangfuseClient): () => void;
```

### `@harness/eval`

Thin layer over Evalite plus export adapters:

```ts
export { evalite } from "evalite";              // re-export for convenience
export function exactMatch(): Scorer<string>;
export function includes(): Scorer<string>;
export function llmJudge(opts: LlmJudgeOpts): Scorer<string>;
export function toInspectLog(report: EvalReport, path: string): Promise<void>;
export function toLangfuse(report: EvalReport, client: LangfuseClient): Promise<void>;
```

### `@harness/cli`

`harness-eval [pattern]` — discovers `*.eval.ts`, runs them across a model matrix, writes `.harness/reports/<timestamp>/index.html` + `results.jsonl`, optional Inspect-AI log + Langfuse push.

### Shape invariants

1. **Stream-first.** Internally everything is `AsyncIterable<AgentEvent>`. `run()` drains the stream and returns the final `RunResult`.
2. **Plain interfaces, no classes.** `Provider`, `Tool`, `ConversationStore`, `Compactor`, `Checkpointer` are all interfaces.
3. **Composition over primitives.** Subagents, handoff, graph all produce or consume the same `Agent` type.
4. **Structured output** uses Zod via `responseFormat`; AI SDK handles provider-specific translation; harness layers auto-repair and streaming.

## 5. Data flow — the agent loop

```
createAgent(cfg).stream({ conversationId, userMessage })
  │
  ▼
1. memory.load(conversationId)
2. checkpointer?.load(runId) → resume if present
3. compactor.compact(history)
4. guardrails.input(userMessage)
5. budgets.check()
6. memory.append(userMessage)

LOOP (until finish or maxTurns):
  7. ensure cache breakpoints (auto-insert after system+tools if enabled)
  8. provider.stream({ messages, tools, signal })
  9. forward text-delta, thinking-delta, structured-partial to caller
 10. collect tool-calls from stream
 11. on usage event → budgets.update(); may abort
 12. if no tool-calls → guardrails.output() → finish
 13. else for each tool-call (parallel):
       a. validate args with tool.parameters (Zod); auto-repair structured output failures
       b. if tool.requireApproval → emit 'tool-approval-required'; await resolver
       c. tool.execute(args, ctx)
       d. emit tool-result event
       e. append tool-call + tool-result to messages
 14. memory.append(assistant message + tool results)
 15. checkpointer?.save(runId, state)
 16. loop
```

### AgentEvent

Superset of provider `StreamEvent`:

```ts
type AgentEvent =
  | StreamEvent
  | { type: "turn-start"; turn: number }
  | { type: "tool-start"; id: string; name: string; args: unknown }
  | { type: "tool-approval-required"; id: string; name: string; args: unknown }
  | { type: "tool-result"; id: string; result: unknown; durationMs: number }
  | { type: "tool-error"; id: string; error: HarnessError }
  | { type: "compaction"; droppedTurns: number; summaryTokens: number }
  | { type: "structured.repair"; attempt: number; issues: unknown }
  | { type: "guardrail-blocked"; phase: "input" | "output"; reason: string }
  | { type: "handoff"; from: string; to: string }
  | { type: "checkpoint"; runId: string; turn: number }
  | { type: "budget.exceeded"; kind: "usd" | "tokens"; spent: number; limit: number }
  | { type: "abort"; reason?: string };
```

`run()` drains this stream and returns `{ finalMessage, turns, usage, costUSD, checkpoint? }`.

### Cancellation

`AbortSignal` flows top-down: `run(input, { signal })` → `provider.stream(..., signal)` → `tool.execute(args, { signal })`. Abort terminates the loop, emits an `abort` event, persists partial state via the checkpointer.

### Retry boundary

Retries wrap provider calls only, not the outer loop. A tool that throws becomes a tool-result with `isError: true` — the model decides whether to retry the tool.

### Subagents, handoff, graph

- **subagentAsTool(child, spec)** — returns a regular `Tool`. Fresh `conversationId` for the child; same `signal`; child events stream up namespaced; child budget is carved from parent budget.
- **handoff(target, carry)** — returns a special tool; invoking it ends the current agent's turn and resumes the conversation under `target` with shared state. Emits `handoff` event. Budget carries over.
- **graph({ nodes, edges, checkpointer })** — compiles a state machine into an `Agent`. Each node is either an agent or a function; edges may be conditional. Checkpoints taken on every node transition. Interrupts via HITL approval or explicit `interrupt()` in a node.

### Compaction

Runs before each provider call. Default: token-count via provider-reported usage (fallback: `gpt-tokenizer`); if under `threshold * contextWindow`, pass through; else keep system + last N turns and summarize the middle with the same-family cheapest model. Configurable via `summarizingCompactor({ summarizer })`.

### Prompt caching

When `cache.autoInsert` is true (default) and the provider supports caching, the harness inserts a cache breakpoint after the system prompt and tool definitions. Users can add more boundaries with `cacheBoundary: true` on any message. `provider.usage` events include `cacheReadTokens` / `cacheWriteTokens` when available, and cost calculations use `cachedInputPerMTok` when present in the PriceBook.

### Structured output

When `responseFormat` is provided:

- If the provider supports streaming structured output, `structured-partial` events stream partial validated values.
- On final validation failure, the loop runs `maxRepairAttempts` (default 2) repair calls that include the Zod issues in the message, emitting `structured.repair` per attempt. If still invalid, throws `ValidationError`.

### Human-in-the-loop

Tools may declare `requireApproval`. When triggered, the loop emits `tool-approval-required` with a stable `approvalId`, yields, and waits for `resolver.resolve(approvalId, decision)`:

```ts
type ApprovalDecision =
  | { approve: true }
  | { approve: false; reason?: string }                 // becomes a tool-error visible to model
  | { approve: true; modifiedArgs: unknown };           // re-validates, proceeds
```

When a checkpointer is configured, waiting-for-approval is a first-class persistable state. Runs can pause for hours and resume from a stored state.

### Budget enforcement

`budgets: { usd?, tokens? }` on `AgentConfig`. Tracked against `provider.usage` events plus tool costs (if tools report). Propagates into subagents (`subagentAsTool` inherits the remaining budget by default; spec may override with a sub-budget). Exceeding throws `BudgetExceededError` and emits `budget.exceeded`.

## 6. Error handling & resilience

### Error taxonomy

```ts
export abstract class HarnessError extends Error {
  abstract readonly class: "provider" | "tool" | "validation" | "guardrail" | "budget" | "loop";
  readonly cause?: unknown;
  readonly retriable: boolean;
  readonly context: Record<string, unknown>;
}

export class ProviderError extends HarnessError {
  readonly kind: "rate_limit" | "timeout" | "server" | "auth" | "bad_request" | "unknown";
  readonly status?: number;
}
export class ToolError extends HarnessError { readonly toolName: string; }
export class ValidationError extends HarnessError { readonly zodIssues: unknown; }
export class GuardrailError extends HarnessError { readonly phase: "input" | "output"; }
export class BudgetExceededError extends HarnessError { readonly kind: "usd" | "tokens"; readonly spent: number; readonly limit: number; }
export class LoopExhaustedError extends HarnessError { readonly turns: number; }
```

### Reaction matrix

| Failure | Loop reaction | Visible to model? |
|---|---|---|
| `ProviderError` retriable (5xx/429/network) | Retry with backoff + jitter, up to `maxAttempts` | No |
| `ProviderError` non-retriable (4xx/auth/bad_request) | Throw from `run()` / error event on stream | No |
| `ToolError` (inside `execute()`) | Wrap, emit `tool-error`, send to model as tool-result with `isError: true` | Yes |
| `ValidationError` on structured output | Auto-repair up to `maxRepairAttempts`, then throw | Yes (during repair) |
| `ValidationError` on tool args | Same as ToolError, Zod issues serialized | Yes |
| `GuardrailError` input phase | Abort turn, emit `guardrail-blocked`, throw | No |
| `GuardrailError` output phase | Strip/replace assistant message per hook policy | Optional |
| HITL denial | Sent to model as tool-error with `reason` | Yes |
| `BudgetExceededError` | Abort, emit `budget.exceeded`, persist checkpoint, throw | No |
| `AbortError` | Flush partial state, emit `abort`, persist checkpoint, reject `run()` | No |
| `maxTurns` exceeded | Throw `LoopExhaustedError` with trace context | No |

### Retry policy (`core/retry.ts`)

```ts
export interface RetryPolicy {
  maxAttempts: number;              // default 4
  baseDelayMs: number;              // default 500
  maxDelayMs: number;               // default 30_000
  jitter: "full" | "none";          // default "full"
  retryOn: (e: unknown) => boolean; // default: retriable ProviderError + fetch network errors
}
```

Respects `Retry-After` for 429s. Checks `signal.aborted` between attempts — abort wins over retry. Emits `provider.retry` events.

### Guardrail hook shape

```ts
export interface InputHook {
  (input: { messages: Message[]; ctx: RunContext }):
    Promise<{ action: "pass" } | { action: "block"; reason: string } | { action: "rewrite"; messages: Message[] }>;
}
export interface OutputHook {
  (output: { message: Message; ctx: RunContext }):
    Promise<{ action: "pass" } | { action: "block"; reason: string } | { action: "rewrite"; message: Message }>;
}
```

Hooks run sequentially; first non-`pass` wins. Interface only — no bundled classifiers.

### Partial state on failure

Every exception escaping `run()` carries `conversationId`, `turn`, `messagesAtFailure`, `partialResponse`, checkpoint ref (if any), and the original `cause`.

### Non-behaviors

- No circuit breakers, bulkheads, or automatic provider fallback.
- No auto-truncation on `bad_request: context_too_long` — that is the compactor's job.
- No bundled PII/jailbreak/toxicity classifiers — interfaces only.

## 7. Observability & evals

### Event catalog

```ts
export interface HarnessEvents {
  "run.start":        { runId: string; conversationId: string; input: RunInput };
  "run.finish":       { runId: string; result: RunResult };
  "run.error":        { runId: string; error: HarnessError };
  "turn.start":       { runId: string; turn: number };
  "turn.finish":      { runId: string; turn: number; usage: Usage };
  "provider.call":    { runId: string; providerId: string; request: GenerateRequest };
  "provider.usage":   { runId: string; tokens: Usage; costUSD?: number; cache?: { read: number; write: number } };
  "provider.retry":   { runId: string; attempt: number; delayMs: number; error: unknown };
  "tool.start":       { runId: string; toolName: string; args: unknown };
  "tool.approval":    { runId: string; approvalId: string; toolName: string; args: unknown };
  "tool.finish":      { runId: string; toolName: string; result: unknown; durationMs: number };
  "tool.error":       { runId: string; toolName: string; error: HarnessError };
  "compaction":       { runId: string; droppedTurns: number; summaryTokens: number };
  "structured.repair":{ runId: string; attempt: number; issues: unknown };
  "guardrail":        { runId: string; phase: "input" | "output"; action: string };
  "handoff":          { runId: string; from: string; to: string };
  "checkpoint":       { runId: string; turn: number; ref: string };
  "budget.exceeded":  { runId: string; kind: "usd" | "tokens"; spent: number; limit: number };
}
```

Every event carries `runId`. One run = one trace. Conversation IDs group runs.

### Shipped sinks

1. `createEventBus()` — in-memory pub/sub, zero deps.
2. `consoleSink(bus, { level })` — pretty JSON to stdout. CLI default.
3. `jsonlSink(bus, { path })` — append-only JSONL.
4. `otelAdapter(bus, tracer)` — opt-in. Maps events to OTel spans.
5. `langfuseAdapter(bus, client)` — opt-in. Maps events to Langfuse traces/spans, including tool calls and costs.

### Cost tracking

```ts
export interface PriceBook {
  [modelId: string]: { inputPerMTok: number; outputPerMTok: number; cachedInputPerMTok?: number; thinkingPerMTok?: number };
}
export function trackCost(bus: EventBus, prices: PriceBook): void;
```

Subscribes to `provider.usage`, enriches with `costUSD`, re-emits. A minimal `defaultPrices.ts` covers a handful of common models; users curate their own.

### Eval DSL (Evalite-based)

```ts
import { evalite } from "@harness/eval";
import { exactMatch } from "@harness/eval";
import { createAgent } from "@harness/agent";

evalite("qa accuracy on fixtures", {
  data: () => import("./fixtures/qa.json"),
  task: async (input) => {
    const agent = createAgent({ provider: ctx.provider, systemPrompt: "..." });
    const { finalMessage } = await agent.run({ userMessage: input.question });
    return finalMessage.content;
  },
  scorers: [exactMatch()],
  threshold: 0.8,
});
```

Evalite gives us Vitest-native discovery, a local UI, and scorer composition for free. Harness adds:

- Agent-oriented scorers (`exactMatch`, `includes`, `llmJudge`, `toolCalled`, `finishedWithin`).
- Inspect-AI log export for research interoperability.
- Langfuse trace push for hosted dashboards.
- Model-matrix + HTML report + report persistence via the `harness-eval` CLI.

### Eval CLI

```
$ harness-eval "packages/**/*.eval.ts" \
    --models openrouter:anthropic/claude-opus-4-7,openrouter:openai/gpt-5 \
    --concurrency 8 \
    --export inspect,langfuse
```

Registry-based: `evalite` calls also run under `vitest` / `bun test` directly. CLI adds model matrix, HTML report, and export adapters.

## 8. Developer experience

### First-run target

```
$ gh repo clone harness-starter && cd harness-starter
$ bun install
$ cp apps/cli-chat/.env.example apps/cli-chat/.env     # OPENROUTER_API_KEY
$ bun run chat
```

Time-to-first-response under 3 minutes from clone.

### Root scripts

```jsonc
{
  "scripts": {
    "chat":      "bun --filter @harness/example-cli-chat dev",
    "server":    "bun --filter @harness/example-http-server dev",
    "build":     "bun --filter '*' run build",
    "test":      "bun test",
    "typecheck": "bun --filter '*' run typecheck",
    "lint":      "biome check .",
    "format":    "biome format --write .",
    "eval":      "bun --filter @harness/cli dev -- eval",
    "ci":        "bun run lint && bun run typecheck && bun run build && bun test"
  }
}
```

### TypeScript config

`tsconfig.base.json` at root: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "bundler"`, `target: "ES2023"`, `lib: ["ES2023", "DOM"]`. Each package extends base with its own `rootDir`/`outDir` and project `references`.

### Biome config

`recommended` rules on. Custom rule: restrict cross-package imports to enforce dependency direction. Format-on-save recipe in `docs/editor-setup.md`. No ESLint.

### Repository conventions

- **README per package.** Purpose, import examples, public API table, test command.
- **ADRs in `docs/adr/`** for every load-bearing decision in this spec.
- **`apps/`** for runnable demos; **`examples/`** (if it grows) for doc snippets.
- **Conventional Commits** enforced by Commitlint + Lefthook `commit-msg` hook.
- **Changesets** manage CHANGELOG entries even without npm publishing.
- **Lefthook** runs Biome + typecheck on staged files pre-commit.

### CI (GitHub Actions)

```yaml
jobs:
  ci:
    strategy:
      matrix:
        bun-version: [latest]
        node-version: [22]
    runs-on: ubuntu-latest
    steps:
      - oven-sh/setup-bun@v2
      - actions/setup-node@v4
      - bun install --frozen-lockfile
      - bun run lint
      - bun run typecheck
      - bun run build
      - bun test
```

Evals gated behind a separate manual workflow — they cost real money.

### Testing conventions

- Unit tests next to source: `foo.ts` + `foo.test.ts`.
- Eval specs in `*.eval.ts`; excluded from `bun test`.
- **TDD (via superpowers:test-driven-development)** for `packages/*`. Pragmatic/tests-after for `apps/*`.
- No mocks of the `Provider` interface in core tests — `fakeProvider()` (shipped in `@harness/core/testing`) replays scripted streams. Live-provider tests gated behind `HARNESS_LIVE=1`.

### Documentation layout

Plain markdown under `/docs`:

- `docs/getting-started.md` — clone to first chat.
- `docs/architecture.md` — trimmed version of this spec.
- `docs/extending/` — one file per extension point: `custom-provider.md`, `custom-tool.md`, `custom-store.md`, `custom-compactor.md`, `custom-checkpointer.md`, `custom-sink.md`.
- `docs/patterns/` — `hierarchical.md`, `handoff.md`, `graph.md`, `hitl.md`, `long-running.md`.
- `docs/adr/` — architecture decisions.
- `docs/upgrading.md` — cherry-pick pattern for pulling upstream changes.

### Versioning

Semver tags on the template repo (`v0.1.0`, …). Changesets produce `CHANGELOG.md`. No npm publishing. Users track upstream via a remote and cherry-pick.

### License

MIT.

## 9. Non-goals (v1)

- No bundled LLM provider beyond what AI SDK already wraps; we pre-wire OpenRouter + Ollama helpers but any AI-SDK provider works.
- No vector DB or dedicated RAG primitives. RAG is a user-land compactor or tool.
- No multi-tenant auth or billing. Single-process, single-user assumption.
- No bundled PII/jailbreak/toxicity classifiers — guardrail interfaces only.
- No circuit breakers, fallback-provider chains, or bundled tracing exporters beyond OTel + Langfuse.
- No agent-manifest loader (`agent.md` / `agent.yaml`). Agents are TS objects.
- No stateful HTTP sessions — server is pure `(conversationId, input) → stream`.
- No shell/code-exec built-in tool in v1 (sandboxing is non-trivial). Ship later as `@harness/sandbox` or via E2B/Daytona/Modal adapters.
- No Deno or edge-runtime CI matrix. `core` is Web-API compatible but not officially exercised there.
- No Python bridge or cross-language interop.
- No auto-upgrade tooling for cloned repos. `docs/upgrading.md` documents the cherry-pick flow.
- No npm publishing. Template repo only.

## 10. Success criteria

- A user clones the repo and has a working streaming CLI chat agent in under 3 minutes.
- Swapping from OpenRouter to Ollama is a one-line change in the example app.
- Writing a custom tool is under 15 lines including the Zod schema.
- A long-running agent can pause on a HITL approval, persist via the checkpointer, and resume in a new process with no code changes.
- All packages build, typecheck, lint, and test under a single `bun run ci` command in under 30 seconds on a laptop.
- A user can delete `packages/eval/`, `packages/mcp/`, `packages/memory-sqlite/`, or `apps/http-server/` and the rest of the repo still builds and tests cleanly.
