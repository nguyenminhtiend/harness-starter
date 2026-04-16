# Harness Starter — Architecture Design

**Status:** Approved — ready for implementation planning
**Date:** 2026-04-17
**Scope:** Monorepo-level architecture spec. Each package gets its own detailed spec when implemented.

## 1. Purpose

Provide a TypeScript-first, clone-and-own starter for building agentic AI systems in 2026. The starter bundles three subsystems that work together but are independently usable:

1. **Provider abstraction** — extensible interface for any LLM backend, built on Vercel AI SDK v5.
2. **Agent runtime harness** — tool-calling loop, memory, streaming, compaction, guardrails, subagents.
3. **Eval harness** — TS-native DSL plus CLI wrapper for running evaluations as tests-with-scoring.

The starter targets app developers, researchers, and platform teams equally, so defaults prioritize a small, boring, production-credible surface over novel abstractions.

## 2. Design decisions (summary)

| Dimension | Choice |
|---|---|
| Shape | Layered modular monorepo — packages `core`, `agent`, `eval`, `cli`, plus `apps/cli-chat` |
| Distribution | Clone-and-own template repo. Not published to npm. |
| Runtime | Node 22+ **and** Bun. `core` uses only Web-standard APIs. |
| Provider core | Built on Vercel AI SDK v5, wrapped by an extensible `Provider` interface |
| Agent patterns | Single-agent core; subagents are plain tools; multi-agent is user-land composition |
| Tools | Zod-based functions; MCP adapter deferred to post-v1 |
| Monorepo tooling | Bun workspaces (no Turbo/Nx) |
| Memory | In-memory default, pluggable `ConversationStore` interface |
| Observability | Custom event bus + optional OTel adapter |
| Eval | TS-native DSL + `harness-eval` CLI |
| Schema | Zod v4 |
| Tests | `bun test` |
| Example | CLI chat agent |
| TS toolchain | TypeScript 5.7+ strict, Biome for lint+format |
| Context management | Pluggable `Compactor` with a keep-last-N + summarize default |
| Built-ins | AbortSignal cancellation, cost tracking, retry with backoff, guardrails hooks |

## 3. Repository layout

```
harness-starter/
├── package.json              # workspace root (bun workspaces)
├── bunfig.toml
├── biome.json
├── tsconfig.base.json
├── packages/
│   ├── core/                 # @harness/core
│   │   └── src/
│   │       ├── provider/     # Provider interface + AI-SDK-backed impl
│   │       ├── events/       # event bus + console/OTel adapters
│   │       ├── errors.ts
│   │       ├── retry.ts
│   │       ├── cost.ts
│   │       ├── abort.ts
│   │       └── index.ts
│   ├── agent/                # @harness/agent
│   │   └── src/
│   │       ├── loop.ts
│   │       ├── tools/
│   │       ├── memory/
│   │       ├── compaction/
│   │       ├── guardrails/
│   │       ├── subagents/
│   │       └── index.ts
│   ├── eval/                 # @harness/eval
│   │   └── src/
│   │       ├── dsl.ts
│   │       ├── runner.ts
│   │       └── index.ts
│   └── cli/                  # @harness/cli
│       └── src/
│           └── eval.ts
├── apps/
│   └── cli-chat/             # example: terminal chat agent
└── docs/
```

### Dependency direction

Enforced by tsconfig `references` and a Biome `noRestrictedImports` rule.

- `core` depends on nothing internal
- `agent` imports from `core`
- `eval` imports from `core` and `agent`
- `cli` imports from `core`, `agent`, `eval`

### Runtime boundary

`core` uses only Web-standard APIs (`fetch`, `ReadableStream`, `AbortSignal`) so it runs on Node, Bun, and edge runtimes without adapters. Node/Bun-specific functionality (fs-backed stores, process-level tracing exporters) lives in `agent` or is shipped as opt-in adapters.

### Clone-and-own affordances

Each package is a self-contained unit with its own `package.json`, tests, and README. A user can delete `packages/eval/` or swap `packages/agent/memory/` without touching other packages. Deleting any single package (including `eval`) leaves the rest of the repo building and testing cleanly. This is a tested success criterion, not just an aspiration.

## 4. Public API surface

### `@harness/core`

```ts
export interface Provider {
  readonly id: string;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
  stream(req: GenerateRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
}

export interface GenerateRequest {
  messages: Message[];
  tools?: ToolSchema[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ZodType;
}

export type StreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | { type: "usage"; tokens: Usage; costUSD?: number }
  | { type: "finish"; reason: FinishReason };

export function aiSdkProvider(model: LanguageModel, opts?: ProviderOpts): Provider;

export interface EventBus {
  emit<K extends keyof HarnessEvents>(ev: K, payload: HarnessEvents[K]): void;
  on<K extends keyof HarnessEvents>(ev: K, h: (p: HarnessEvents[K]) => void): () => void;
}
export function createEventBus(): EventBus;
export function otelAdapter(bus: EventBus, tracer: Tracer): void;
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
  systemPrompt?: string;
  tools?: Tool[];
  memory?: ConversationStore;
  compactor?: Compactor;
  guardrails?: { input?: InputHook[]; output?: OutputHook[] };
  events?: EventBus;
  maxTurns?: number;
}

export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  parameters: ZodType<I>;
  execute(args: I, ctx: ToolContext): Promise<O>;
}
export function tool<I, O>(def: Tool<I, O>): Tool<I, O>;

export function subagentAsTool(child: Agent, spec: SubagentSpec): Tool;

export interface ConversationStore {
  load(conversationId: string): Promise<Message[]>;
  append(conversationId: string, messages: Message[]): Promise<void>;
}
export function inMemoryStore(): ConversationStore;
```

### `@harness/eval`

```ts
export function evalCase<Ctx>(name: string, fn: EvalFn<Ctx>): void;
export function dataset<T>(load: () => Promise<T[]> | T[]): Dataset<T>;
export function scorer<T>(name: string, fn: ScorerFn<T>): Scorer<T>;
export function runEvals(opts: RunEvalsOpts): Promise<EvalReport>;
```

### `@harness/cli`

`harness-eval [pattern]` — discovers `*.eval.ts` files, runs them, writes `.harness/reports/<timestamp>/index.html` plus `results.jsonl`.

### Shape invariants

1. **Stream-first.** Internally everything is `AsyncIterable<StreamEvent>`. `run()` drains the stream and returns the final `RunResult`. Fewer duplicated code paths and clearer invariants.
2. **Plain interfaces, no classes.** `Provider`, `Tool`, `ConversationStore`, `Compactor` are all interfaces. No DI framework, no base classes to extend.
3. **Multi-agent is composition, not a primitive.** `subagentAsTool(childAgent, spec)` returns a regular `Tool`. Planner → researcher → writer workflows are just a parent agent with subagent tools.
4. **Structured output** uses Zod via `responseFormat`; AI SDK handles provider-specific translation.

## 5. Data flow — the agent loop

```
createAgent(cfg).stream({ conversationId, userMessage })
  │
  ▼
1. memory.load(conversationId)
2. compactor.compact(history)            → [messages]
3. guardrails.input(userMessage)         → may reject/rewrite
4. memory.append(userMessage)

LOOP (until finish or maxTurns):
  5. provider.stream({ messages, tools, signal })
  6. forward text-delta events to caller
  7. collect tool-calls from stream
  8. if no tool-calls → guardrails.output() → finish
  9. else: for each tool-call (parallel):
       a. validate args with tool.parameters (Zod)
       b. tool.execute(args, ctx)
       c. emit tool-result event
       d. append tool-call + tool-result to messages
  10. memory.append(assistant message + tool results)
  11. loop
```

### AgentEvent

Superset of provider `StreamEvent`:

```ts
type AgentEvent =
  | StreamEvent
  | { type: "turn-start"; turn: number }
  | { type: "tool-start"; id: string; name: string; args: unknown }
  | { type: "tool-result"; id: string; result: unknown; durationMs: number }
  | { type: "tool-error"; id: string; error: HarnessError }
  | { type: "compaction"; droppedTurns: number; summaryTokens: number }
  | { type: "guardrail-blocked"; phase: "input" | "output"; reason: string }
  | { type: "abort"; reason?: string };
```

`run()` just drains this stream and returns `{ finalMessage, turns, usage, costUSD }`.

### Cancellation

`AbortSignal` flows top-down: `run(input, { signal })` → `provider.stream(..., signal)` → `tool.execute(args, { signal })`. Abort terminates the loop, emits an `abort` event, and persists partial state.

### Retry boundary

Retries wrap provider calls only, not the outer loop. A tool that throws becomes a tool-result with `isError: true` — the model decides whether to retry the tool. This keeps retry semantics clear: infra errors retry automatically; logic errors become model-visible.

### Subagents as tools

`subagentAsTool(childAgent, spec)` returns a regular `Tool`. On invocation:

1. Creates a fresh `conversationId` for the child
2. Passes the same `signal` down
3. Streams child events up through the parent event bus with a namespace
4. Returns the child's `finalMessage` as the tool result

### Compaction

Runs before each provider call, not after. Default strategy: token-count the current messages; if under `threshold * contextWindow`, pass through; otherwise keep system prompt + last N turns and summarize the middle via a cheaper model (configurable). Users swap in vector recall, semantic windowing, or custom strategies through the `Compactor` interface.

## 6. Error handling & resilience

### Error taxonomy

```ts
export abstract class HarnessError extends Error {
  abstract readonly class: "provider" | "tool" | "validation" | "guardrail";
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
```

### Reaction matrix

| Failure | Loop reaction | Visible to model? |
|---|---|---|
| `ProviderError` retriable (5xx/429/network) | Retry with backoff + jitter, up to `maxAttempts` | No |
| `ProviderError` non-retriable (4xx/auth/bad_request) | Throw from `run()` / error event on stream | No |
| `ToolError` (inside `execute()`) | Wrap, emit `tool-error`, send to model as tool-result with `isError: true` | Yes |
| `ValidationError` (args failed Zod parse) | Same as ToolError, with Zod issues serialized | Yes |
| `GuardrailError` input phase | Abort turn, emit `guardrail-blocked`, throw | No |
| `GuardrailError` output phase | Strip/replace assistant message per hook policy | Optional |
| `AbortError` | Flush partial state, emit `abort`, reject `run()` | No |
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

Respects `Retry-After` header for 429s. Checks `signal.aborted` between attempts — abort wins over retry. Emits `provider.retry` events with attempt counts and delay.

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

Hooks run sequentially; first non-`pass` wins. Interface only — no bundled classifiers (PII, jailbreak, toxicity). Users plug in their own.

### Partial state on failure

Every exception escaping `run()` carries `conversationId`, `turn`, `messagesAtFailure`, `partialResponse`, and the original `cause`. Long-running jobs can always replay from a known-good point.

### Non-behaviors

- No circuit breakers or bulkheads in core — those belong at the service layer.
- No automatic fallback providers — trivial to write on top, too subtle to bake in.
- No auto-truncation on `bad_request: context_too_long` — that is the compactor's job; if it fires post-call, the compactor is misconfigured.

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
  "provider.usage":   { runId: string; tokens: Usage; costUSD?: number };
  "provider.retry":   { runId: string; attempt: number; delayMs: number; error: unknown };
  "tool.start":       { runId: string; toolName: string; args: unknown };
  "tool.finish":      { runId: string; toolName: string; result: unknown; durationMs: number };
  "tool.error":       { runId: string; toolName: string; error: HarnessError };
  "compaction":       { runId: string; droppedTurns: number; summaryTokens: number };
  "guardrail":        { runId: string; phase: "input" | "output"; action: string };
}
```

Every event carries `runId`. One run = one trace. Conversation IDs group runs.

### Shipped sinks

1. `createEventBus()` — in-memory pub/sub, zero deps, runs everywhere.
2. `consoleSink(bus, { level })` — pretty-printed JSON to stdout. CLI default.
3. `jsonlSink(bus, { path })` — append-only JSONL; useful for eval replay.
4. `otelAdapter(bus, tracer)` — opt-in. Maps events to OTel spans. Users BYO tracer/exporter.

### Cost tracking

```ts
export interface PriceBook {
  [modelId: string]: { inputPerMTok: number; outputPerMTok: number; cachedInputPerMTok?: number };
}
export function trackCost(bus: EventBus, prices: PriceBook): void;
```

`trackCost` subscribes to `provider.usage`, enriches with `costUSD`, re-emits. A minimal `defaultPrices.ts` covers a handful of common models; users curate their own.

### Eval DSL

```ts
import { evalCase, dataset, scorer } from "@harness/eval";
import { createAgent } from "@harness/agent";

const cases = dataset(() => import("./fixtures/qa.json"));

const exactMatch = scorer<string>("exact_match", async ({ expected, actual }) =>
  actual.trim() === expected ? 1 : 0
);

evalCase("qa accuracy on fixtures", {
  data: cases,
  run: async ({ input, ctx }) => {
    const agent = createAgent({ provider: ctx.provider, systemPrompt: "..." });
    const { finalMessage } = await agent.run({ userMessage: input.question });
    return finalMessage.content;
  },
  score: [exactMatch],
  target: { exact_match: 0.8 },
});
```

### Eval runner

```ts
export async function runEvals(opts: {
  patterns: string[];
  concurrency?: number;
  models?: string[];
  provider: (modelId: string) => Provider;
  reporters?: Reporter[];
  filter?: { name?: RegExp; tags?: string[] };
}): Promise<EvalReport>;
```

Discovers `*.eval.ts`, imports them (evalCase calls register into a module-scoped registry), runs cases × model matrix with bounded parallelism, streams results to reporters, writes `.harness/reports/<timestamp>/index.html` + `results.jsonl`, exits non-zero on target miss.

### Eval CLI

```
$ harness-eval "packages/**/*.eval.ts" \
    --models openrouter:anthropic/claude-opus-4-7,openrouter:openai/gpt-5 \
    --concurrency 8
```

The registry-based design means `evalCase` files also run under `bun test` directly. CLI adds: model matrices, HTML report, report persistence, parallel orchestration.

## 8. Developer experience

### First-run target

```
$ gh repo clone harness-starter && cd harness-starter
$ bun install
$ cp apps/cli-chat/.env.example apps/cli-chat/.env
$ bun run chat
```

Time-to-first-response under 3 minutes from clone.

### Root scripts

```jsonc
{
  "scripts": {
    "chat":      "bun --filter @harness/example-cli-chat dev",
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

`tsconfig.base.json` at root: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "bundler"`, `target: "ES2023"`, `lib: ["ES2023", "DOM"]` for `fetch`/`ReadableStream` types. Each package extends base with its own `rootDir`/`outDir` and uses project `references`.

### Biome config

`recommended` rules on. Custom rule: restrict cross-package imports to enforce dependency direction. Format-on-save recipe in `docs/editor-setup.md`. No ESLint.

### Repository conventions

- **README per package.** Purpose, import examples, public API table, test command.
- **ADRs in `docs/adr/`** for every load-bearing decision in this spec.
- **`apps/`** for runnable demos; **`examples/`** (if it grows) for doc snippets.
- **Conventional Commits**, enforced by a commit-msg hook.

### CI (single GitHub Actions workflow)

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - oven-sh/setup-bun@v2
      - bun install --frozen-lockfile
      - bun run lint
      - bun run typecheck
      - bun run build
      - bun test
```

Matrix on `bun-version` and `node-version` for the Node+Bun parity promise. Evals gated behind a separate manual workflow — they cost real money.

### Testing conventions

- Unit tests next to source: `foo.ts` + `foo.test.ts`
- Eval specs in `*.eval.ts`; excluded from `bun test` by default via pattern
- No mocks of the `Provider` interface in core tests — a `fakeProvider()` helper replays scripted streams. Live-provider tests gated behind `HARNESS_LIVE=1`.

### Documentation layout

- `docs/getting-started.md` — clone to first chat
- `docs/architecture.md` — trimmed version of this spec
- `docs/extending/` — one file per extension point: `custom-provider.md`, `custom-tool.md`, `custom-store.md`, `custom-compactor.md`, `custom-sink.md`, `http-server.md`
- `docs/adr/` — architecture decisions
- `docs/upgrading.md` — cherry-pick pattern for pulling upstream changes

### Versioning

Semver tags on the template repo (`v0.1.0`, …). `CHANGELOG.md` leads with breaking changes. No npm publishing. Users track upstream via a remote and cherry-pick.

## 9. Non-goals

Explicit scope fence so implementation stays focused:

- No bundled LLM provider beyond what AI SDK already wraps.
- No MCP support in v1. Tool interface is Zod-based; MCP adapter is a post-v1 package.
- No web UI or Next.js example. CLI only. An HTTP-server sketch lives in `docs/extending/`.
- No vector DB or RAG primitives. Memory is `load/append`; RAG is a user-land compactor or tool.
- No multi-tenant auth or billing. Single-process, single-user assumption.
- No built-in classifiers (PII, jailbreak, toxicity). Guardrail interfaces only.
- No circuit breakers, fallback-provider chains, or bundled tracing exporters.
- No agent graph DSL. Multi-agent = subagents-as-tools.
- No Python bridge or cross-language interop. TypeScript only.
- No auto-upgrade tooling for cloned repos. `docs/upgrading.md` documents the cherry-pick flow.

## 10. Success criteria

- A user clones the repo and has a working streaming CLI chat agent in under 3 minutes.
- Swapping from OpenRouter to Ollama is a one-line change in the example app.
- Writing a custom tool is under 15 lines including the Zod schema.
- All packages build, typecheck, lint, and test under a single `bun run ci` command in under 30 seconds on a laptop.
- A user can delete `packages/eval/` and the rest of the repo still builds and tests cleanly.
