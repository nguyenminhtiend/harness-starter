# Agent Backend Internals

Deep dive into every layer of the backend agent system — from LLM provider abstraction through the agent loop, graph execution, tool system, and all supporting infrastructure.

---

## Table of Contents

1. [Package Dependency DAG](#1-package-dependency-dag)
2. [Provider Layer (`@harness/core`)](#2-provider-layer)
3. [Event Bus (`@harness/core`)](#3-event-bus)
4. [Error Hierarchy (`@harness/core`)](#4-error-hierarchy)
5. [Retry System (`@harness/core`)](#5-retry-system)
6. [LLM Adapter (`@harness/llm-adapter`)](#6-llm-adapter)
7. [Agent Types (`@harness/agent`)](#7-agent-types)
8. [The Agent Factory: `createAgent()`](#8-the-agent-factory)
9. [The Core Agent Loop: `runLoop()`](#9-the-core-agent-loop)
10. [Tool System](#10-tool-system)
11. [Graph Execution Engine](#11-graph-execution-engine)
12. [Interrupt & Checkpoint System](#12-interrupt--checkpoint-system)
13. [Handoff & Subagent Composition](#13-handoff--subagent-composition)
14. [Memory: Conversation Store](#14-memory-conversation-store)
15. [Compaction](#15-compaction)
16. [Cache Breakpoints](#16-cache-breakpoints)
17. [Budget Tracking](#17-budget-tracking)
18. [Guardrails](#18-guardrails)
19. [Approval Registry (Tool-Level HITL)](#19-approval-registry)
20. [Stream Renderer](#20-stream-renderer)
21. [Observability: Console Sink](#21-observability-console-sink)
22. [Deep Research: End-to-End Walkthrough](#22-deep-research-end-to-end-walkthrough)
23. [Fetch Tool (`@harness/tools`)](#23-fetch-tool)

---

## 1. Package Dependency DAG

```
core ─┬─> agent ─┬─> tools
      │          ├─> mcp
      │          ├─> memory-sqlite
      │          ├─> hitl
      │          └─> eval ─> cli
      ├─> llm-adapter
      └─> observability

session-store (standalone)
session-events ─> agent, core, session-store
```

- **`@harness/core`** — Web-standard APIs only. Provider interface, EventBus, errors, retry, abort, cost tracking.
- **`@harness/agent`** — Agent loop, graph, handoff, subagent, tools, memory, compaction, checkpointing, guardrails, budgets.
- **`@harness/llm-adapter`** — Maps `"google:gemini-2.5-flash"` string specs to concrete `Provider` instances.
- **`@harness/tools`** — Built-in tools (fetch).
- **`@harness/observability`** — Console sink, future OTel exporters.
- **`@harness/session-events`** — Bridge between `AgentEvent` and `UIEvent`.

---

## 2. Provider Layer

### `core/src/provider/types.ts`

The `Provider` interface is the universal LLM abstraction. Every provider — Google, OpenRouter, Groq, Ollama — implements this same interface.

```ts
export interface Provider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
  stream(req: GenerateRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  batch?(reqs: GenerateRequest[], signal?: AbortSignal): Promise<BatchHandle>;
}
```

**`ProviderCapabilities`** declares feature support per model:

```ts
export interface ProviderCapabilities {
  caching: boolean;       // prompt caching (Anthropic, Google)
  thinking: boolean;       // reasoning/thinking tokens
  batch: boolean;          // batch API
  structuredStream: boolean; // streaming structured output
}
```

**`GenerateRequest`** carries the full request payload:

```ts
export interface GenerateRequest {
  messages: Message[];
  tools?: ToolSchema[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ZodType;    // structured output via Zod schema
  thinking?: { enabled: boolean; budgetTokens?: number };
  cache?: { autoInsert?: boolean };
}
```

**`StreamEvent`** is the union of all streaming chunk types:

```ts
export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string }
  | { type: 'structured-partial'; path: string; value: unknown }
  | { type: 'tool-call'; id: string; name: string; args: unknown }
  | { type: 'usage'; tokens: Usage; costUSD?: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'finish'; reason: FinishReason };
```

**`Message`** supports both string content and multimodal parts:

```ts
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessagePart[];
  cacheBoundary?: boolean;      // hint for prompt caching
}

export type MessagePart = TextPart | ImagePart | ToolCallPart | ToolResultPart;
```

### `core/src/provider/ai-sdk-provider.ts`

The concrete provider implementation wraps Vercel AI SDK v5:

```ts
export function aiSdkProvider(model: LanguageModelV2 | LanguageModelV3, opts?: ProviderOpts): Provider
```

**`generate()`** calls `generateText()` from the AI SDK. If `responseFormat` is set, it calls `generateObject()` instead — the Zod schema is passed directly.

**`stream()`** calls `streamText()` and iterates over `result.fullStream`, translating AI SDK chunk types to harness `StreamEvent`s:

| AI SDK chunk     | Harness StreamEvent |
|-----------------|---------------------|
| `text-delta`     | `text-delta`        |
| `reasoning-delta`| `thinking-delta`    |
| `tool-call`      | `tool-call`         |
| `finish-step`    | `usage`             |
| `finish`         | `finish`            |

**Error classification** — `classifyError()` wraps all AI SDK errors into `ProviderError` with a `kind`:

| HTTP Status  | Kind          | Retriable? |
|-------------|---------------|------------|
| 429          | `rate_limit`  | yes        |
| 408, 504     | `timeout`     | yes        |
| 401, 403     | `auth`        | no         |
| 400-499      | `bad_request` | no         |
| 500+         | `server`      | yes        |
| Network/fetch| `timeout`     | yes        |

---

## 3. Event Bus

### `core/src/events/bus.ts`

A synchronous, typed pub/sub system. Events fire in the same tick — no async queuing.

```ts
export interface EventBus {
  emit<K extends keyof HarnessEvents>(ev: K, payload: HarnessEvents[K]): void;
  on<K extends keyof HarnessEvents>(ev: K, handler: (payload: HarnessEvents[K]) => void): () => void;
}
```

`createEventBus()` uses a `Map<string, Handler[]>` internally. `on()` returns an unsubscribe function. Handler errors are caught and forwarded to `opts.onError` if provided (never thrown to the emitter).

**All event types** (defined in `HarnessEvents`):

| Event              | Emitted by           | Payload                                    |
|-------------------|---------------------|--------------------------------------------|
| `run.start`        | Agent loop           | `{ runId, conversationId, input }`         |
| `run.finish`       | Agent loop           | `{ runId, result }`                        |
| `run.error`        | Agent loop           | `{ runId, error }`                         |
| `turn.start`       | Agent loop           | `{ runId, turn }`                          |
| `turn.finish`      | Agent loop           | `{ runId, turn, usage }`                   |
| `provider.call`    | Agent loop           | `{ runId, providerId, request }`           |
| `provider.usage`   | Provider stream      | `{ runId, tokens, costUSD?, cache? }`      |
| `provider.retry`   | Retry wrapper        | `{ runId, attempt, delayMs, error }`       |
| `tool.start`       | Tool executor        | `{ runId, toolName, args }`                |
| `tool.finish`      | Tool executor        | `{ runId, toolName, result, durationMs }`  |
| `tool.error`       | Tool executor        | `{ runId, toolName, error }`               |
| `tool.approval`    | Tool approval        | `{ runId, approvalId, toolName, args }`    |
| `compaction`       | Compactor            | `{ runId, droppedTurns, summaryTokens }`   |
| `structured.repair`| Structured output    | `{ runId, attempt, issues }`               |
| `guardrail`        | Guardrail hooks      | `{ runId, phase, action }`                 |
| `handoff`          | Graph/Handoff        | `{ runId, from, to }`                      |
| `checkpoint`       | Checkpointer         | `{ runId, turn, ref }`                     |
| `budget.exceeded`  | Budget tracker       | `{ runId, kind, spent, limit }`            |

---

## 4. Error Hierarchy

### `core/src/errors.ts`

All harness errors extend the abstract `HarnessError`:

```
HarnessError (abstract)
├── ProviderError    (class: 'provider')  — LLM API failures
├── ToolError        (class: 'tool')      — tool execution failures
├── ValidationError  (class: 'validation') — schema/argument issues
├── GuardrailError   (class: 'guardrail') — blocked by input/output guard
├── BudgetExceededError (class: 'budget') — USD or token limit hit
└── LoopExhaustedError  (class: 'loop')   — maxTurns exceeded
```

Key properties on every `HarnessError`:
- **`retriable`** — whether the system should retry
- **`context`** — arbitrary metadata bag
- **`toJSON()`** — serialization for event payloads

`ProviderError` adds:
- **`kind`**: `'rate_limit' | 'timeout' | 'server' | 'auth' | 'bad_request' | 'unknown'`
- **`status`**: HTTP status code
- **`retryAfter`**: milliseconds (from Retry-After header)

`ToolError` adds **`toolName`**. A tool that throws any non-`HandoffSignal` error gets wrapped into a `ToolError` automatically — the error becomes a tool result with `isError: true` rather than crashing the loop.

---

## 5. Retry System

### `core/src/retry.ts`

`withRetry()` wraps any async function with exponential backoff:

```ts
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  policy: Partial<RetryPolicy> = {},
  opts: WithRetryOpts = {},
): Promise<T>
```

Default policy:

```ts
const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 'full',
  retryOn: (e) => (e instanceof ProviderError && e.retriable) || isNetworkError(e),
};
```

**Delay calculation**: exponential backoff (`baseDelay * 2^attempt`, capped at `maxDelayMs`), with full jitter (`Math.random() * base`). If the error carries `retryAfter`, that's used as a floor.

**Abort-aware**: the delay `setTimeout` is cancelled immediately if the signal aborts. Each retry emits a `provider.retry` bus event.

**Only provider calls are retried.** Tool failures become error results. The outer loop never retries.

---

## 6. LLM Adapter

### `llm-adapter/src/provider.ts`

Parses a `"provider:model"` string and creates the corresponding AI SDK model:

```ts
export function createProvider(keys: ProviderKeys, spec: string): Provider
```

`parseModelSpec("google:gemini-2.5-flash")` → `{ provider: 'google', model: 'gemini-2.5-flash' }`. No colon defaults to `openrouter`.

| Provider      | SDK Factory                    | Auth                          |
|--------------|-------------------------------|-------------------------------|
| `google:`     | `createGoogleGenerativeAI()`   | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `openrouter:` | `createOpenRouter()`           | `OPENROUTER_API_KEY`          |
| `groq:`       | `createGroq()`                 | `GROQ_API_KEY`                |
| `ollama:`     | `createOpenAI({ baseURL })`    | No key needed (local)         |

Each factory returns an AI SDK `LanguageModel`, which is wrapped with `aiSdkProvider()` to produce a harness `Provider`.

---

## 7. Agent Types

### `agent/src/types.ts`

The **`Agent`** interface is the central abstraction — every agent (simple, graph, handoff) implements it:

```ts
export interface Agent {
  run(input: RunInput, opts?: RunOptions): Promise<RunResult>;
  stream(input: RunInput, opts?: RunOptions): AsyncIterable<AgentEvent>;
}
```

**`RunInput`** — open-ended, but always has optional `conversationId` and `userMessage`.

**`RunOptions`** — carries `signal` (AbortSignal) and `runId`.

**`RunContext`** — the fully resolved context passed to node functions and tools:

```ts
export interface RunContext {
  runId: string;
  conversationId: string;
  signal: AbortSignal;
  bus?: EventBus;
}
```

**`AgentEvent`** is the union of all events an agent can yield:

```ts
export type AgentEvent =
  | StreamEvent                   // text-delta, thinking-delta, usage, finish, tool-call, structured-partial
  | { type: 'turn-start'; turn: number }
  | { type: 'tool-start'; id: string; name: string; args: unknown }
  | { type: 'tool-approval-required'; id: string; name: string; args: unknown }
  | { type: 'tool-result'; id: string; result: unknown; durationMs: number }
  | { type: 'tool-error'; id: string; error: HarnessError }
  | { type: 'compaction'; droppedTurns: number; summaryTokens: number }
  | { type: 'structured.repair'; attempt: number; issues: unknown }
  | { type: 'handoff'; from: string; to: string }
  | { type: 'checkpoint'; runId: string; turn: number }
  | { type: 'budget.exceeded'; kind: 'usd' | 'tokens'; spent: number; limit: number }
  | { type: 'abort'; reason?: string };
```

**`AgentConfig`** — everything needed to build an agent:

```ts
export interface AgentConfig {
  provider: Provider;
  systemPrompt?: string | ((ctx: RunContext) => string);
  tools?: Tool[];
  memory?: ConversationStore;
  compactor?: Compactor;
  checkpointer?: Checkpointer;
  guardrails?: { input?: InputHook[]; output?: OutputHook[] };
  events?: EventBus;
  maxTurns?: number;                // default: 10
  budgets?: { usd?: number; tokens?: number };
  retryPolicy?: Partial<RetryPolicy>;
}
```

**`Tool`** — the tool interface:

```ts
export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  parameters: ZodType<I>;
  execute(args: I, ctx: ToolContext): Promise<O>;
  requireApproval?: 'always' | 'never' | ((args: I) => boolean);
}
```

---

## 8. The Agent Factory: `createAgent()`

### `agent/src/create-agent.ts`

`createAgent(cfg)` wires all the hooks together and returns an `Agent`:

```ts
export function createAgent(cfg: AgentConfig): Agent {
  const hooks: LoopHooks = {};
```

**Hooks wired in order:**

1. **Compaction** — if `cfg.compactor` is set, `hooks.compact` delegates to it
2. **Cache breakpoints** — always wired: `hooks.insertCacheBreakpoints = insertCacheBreakpoints`
3. **Approval** — if any tool has `requireApproval !== 'never'`, creates an `ApprovalRegistry`
4. **Checkpointer** — if `cfg.checkpointer` is set, wires `saveCheckpoint`/`loadCheckpoint`
5. **Input/output guardrails** — if any hooks exist in `cfg.guardrails`
6. **Budget tracker** — if `cfg.budgets` is set, creates a `BudgetTracker`

**`stream()`** generates IDs and delegates to `runLoopWithBudgetEvents()`:

```ts
async function* stream(input: RunInput, opts?: RunOptions): AsyncGenerator<AgentEvent, void> {
  const conversationId = input.conversationId ?? crypto.randomUUID();
  const runId = opts?.runId ?? crypto.randomUUID();
  const signal = opts?.signal ?? new AbortController().signal;

  yield* runLoopWithBudgetEvents(
    { provider, systemPrompt, tools, memory, hooks, bus, maxTurns, retryPolicy },
    { conversationId, userMessage: input.userMessage, runId, signal },
  );
}
```

**`run()`** drains `stream()` and collects the result:

```ts
async function run(input, opts): Promise<RunResult> {
  let finalMessage: unknown;
  let turns = 0;
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for await (const event of stream(input, opts)) {
    switch (event.type) {
      case 'turn-start': turns = event.turn; break;
      case 'text-delta':  finalMessage = (finalMessage ?? '') + event.delta; break;
      case 'usage':       totalUsage = addUsage(totalUsage, event.tokens); break;
    }
  }
  return { finalMessage, turns, usage: totalUsage };
}
```

---

## 9. The Core Agent Loop: `runLoop()`

### `agent/src/loop.ts`

This is the heart of every simple agent. It implements the classic LLM tool-use loop.

### Phase 1: Setup

```ts
export async function* runLoop(params, input): AsyncGenerator<AgentEvent, void> {
  // 1a. Build RunContext
  const ctx: RunContext = { runId, conversationId, signal, bus };

  // 1b. Load conversation history from memory
  let messages: Message[] = memory ? await memory.load(conversationId) : [];

  // 1c. Resume from checkpoint (if exists)
  if (hooks.loadCheckpoint) {
    const saved = await hooks.loadCheckpoint(runId);
    if (saved) { messages = saved.messages; }
  }

  // 1d. Prepend system prompt if not already present
  if (systemPrompt && (messages.length === 0 || messages[0]?.role !== 'system')) {
    messages = [{ role: 'system', content: systemPrompt }, ...messages];
  }

  // 1e. Append user message + persist to memory
  if (userMessage) {
    const userMsg = { role: 'user', content: userMessage };
    messages.push(userMsg);
    if (memory) { await memory.append(conversationId, [userMsg]); }
  }

  // 1f. Build tool map (validates no duplicates) + emit run.start
  const toolMap = new Map(tools.map(t => [t.name, t]));
  bus?.emit('run.start', { runId, conversationId, input });
```

### Phase 2: The Turn Loop

```ts
  for (let turn = 1; turn <= maxTurns; turn++) {
    assertNotAborted(signal);      // throws AbortError if cancelled
    hooks.checkBudget?.();         // throws BudgetExceededError if over

    yield { type: 'turn-start', turn };
    bus?.emit('turn.start', { runId, turn });
```

### Phase 3: Pre-Provider Hooks

```ts
    // 3a. Compaction — summarize old messages if token count exceeds threshold
    if (hooks.compact) {
      messages = await hooks.compact(messages, { provider, runId, signal });
    }

    // 3b. Input guardrails — can pass, block (throw), or rewrite messages
    if (hooks.runInputGuardrails) {
      messages = await hooks.runInputGuardrails(messages, ctx);
    }

    // 3c. Cache breakpoints — marks the last system message with cacheBoundary=true
    if (hooks.insertCacheBreakpoints) {
      messages = hooks.insertCacheBreakpoints(messages, provider);
    }
```

### Phase 4: Provider Call

```ts
    bus?.emit('provider.call', { runId, providerId: provider.id, request: { messages, tools } });

    // collectProviderStream handles streaming + retry
    const { text, toolCalls, turnUsage, streamEvents } = await collectProviderStream(
      provider, messages, toolSchemas, hasTools, signal, retryPolicy, bus, runId, hooks,
    );

    // Yield all stream events (text-delta, tool-call, usage, finish)
    for (const ev of streamEvents) { yield ev; }
```

Inside `collectProviderStream()`:

```ts
async function collectProviderStream(...): Promise<ProviderStreamResult> {
  const request: GenerateRequest = hasTools
    ? { messages, tools: toolSchemas, toolChoice: 'auto' }
    : { messages };

  // With retry if policy is configured
  let stream: AsyncIterable<StreamEvent>;
  if (retryPolicy) {
    stream = await withRetry((s) => provider.stream(request, s), retryPolicy, { signal, bus, runId });
  } else {
    stream = provider.stream(request, signal);
  }

  // Drain the stream, collecting text deltas + tool calls + usage
  for await (const event of stream) {
    assertNotAborted(signal);
    streamEvents.push(event);

    switch (event.type) {
      case 'text-delta':  text += event.delta; break;
      case 'tool-call':   toolCalls.push({ type: 'tool-call', toolCallId: event.id, ... }); break;
      case 'usage':
        turnUsage = event.tokens;
        hooks.updateBudget?.(event.tokens);  // update budget tracker
        bus?.emit('provider.usage', { runId, tokens, costUSD, cache });
        break;
    }
  }
  return { text, toolCalls, turnUsage, streamEvents };
}
```

### Phase 5: No Tool Calls → Finish

If the LLM responded with text only (no tool calls), the turn loop ends:

```ts
    if (toolCalls.length === 0) {
      let assistantMsg = { role: 'assistant', content: text };

      // Output guardrails — can pass, block, or rewrite
      if (hooks.runOutputGuardrails) {
        assistantMsg = await hooks.runOutputGuardrails(assistantMsg, ctx);
      }

      messages.push(assistantMsg);
      if (memory) { await memory.append(conversationId, [assistantMsg]); }

      if (hooks.saveCheckpoint) {
        await hooks.saveCheckpoint({ runId, conversationId, turn, messages });
        yield { type: 'checkpoint', runId, turn };
      }

      bus?.emit('run.finish', { runId, result: { finalMessage: text, turns: turn, usage } });
      return;  // ← loop exits cleanly
    }
```

### Phase 6: Tool Calls → Execute

If the LLM requested tool calls:

```ts
    // 6a. Build assistant message with tool-call parts
    const assistantMsg = { role: 'assistant', content: [...textParts, ...toolCalls] };
    messages.push(assistantMsg);

    // 6b. Handle approval for tools that require it
    for (const tc of toolCalls) {
      const toolDef = toolMap.get(tc.toolName);
      if (toolDef && hooks.waitForApproval && needsApproval(toolDef, tc.args)) {
        yield { type: 'tool-approval-required', id: approvalId, name: tc.toolName, args: tc.args };
        // Checkpoint state so approval can survive a restart
        if (hooks.saveCheckpoint) { await hooks.saveCheckpoint({ ... }); }
        const decision = await hooks.waitForApproval(approvalId, tc.toolName, tc.args);
        if (decision.type === 'reject') {
          // Tool becomes an error result, not a crash
          yield { type: 'tool-error', ... };
          continue;
        }
        // If 'approve-with-args', use modifiedArgs
      }
    }

    // 6c. Execute all approved tools in parallel
    const { results, events: toolEvents } = await executeToolCalls(
      approvedOnly, toolMap, ctx, bus
    );
```

### Phase 7: Tool Execution Detail

```ts
async function executeSingleTool(tc, toolMap, ctx, bus, events): Promise<ToolResultPart> {
  const start = Date.now();
  events.push({ type: 'tool-start', id: tc.toolCallId, name: tc.toolName, args: tc.args });
  bus?.emit('tool.start', { runId, toolName, args });

  const toolDef = toolMap.get(tc.toolName);
  if (!toolDef) {
    // Unknown tool → error result (not a throw)
    return errorResult(tc, `Error: Unknown tool "${tc.toolName}"`);
  }

  // Zod validation of args
  const parseResult = toolDef.parameters.safeParse(tc.args);
  if (!parseResult.success) {
    return errorResult(tc, `Validation error: ${issuesSummary}`);
  }

  try {
    const result = await toolDef.execute(parseResult.data, ctx);
    const durationMs = Date.now() - start;
    events.push({ type: 'tool-result', id: tc.toolCallId, result, durationMs });
    bus?.emit('tool.finish', { runId, toolName, result, durationMs });
    return { type: 'tool-result', toolCallId, toolName, result: safeStringify(result) };
  } catch (e) {
    if (e instanceof HandoffSignal) { throw e; }  // HandoffSignal propagates
    // Everything else becomes an error result
    return errorResult(tc, `Error: ${err.message}`);
  }
}
```

Key invariants:
- **Tools never crash the loop.** Errors become `tool-result` with `isError: true`, fed back to the LLM.
- **`HandoffSignal` is the only exception that propagates** — it's caught by the handoff agent.
- **All tool calls execute in parallel** via `Promise.allSettled()`.

### Phase 8: Continue Loop

Tool results are appended as `role: 'tool'` messages, checkpointed, and the loop continues to the next turn (back to Phase 2).

### Phase 9: Loop Exhaustion

If `turn > maxTurns`, the loop throws `LoopExhaustedError`:

```ts
  throw new LoopExhaustedError(`Loop exhausted after ${maxTurns} turns`, { turns: maxTurns });
```

### Budget Event Wrapper

`runLoopWithBudgetEvents()` wraps `runLoop()` to catch `BudgetExceededError` and yield it as an event before re-throwing:

```ts
export async function* runLoopWithBudgetEvents(params, input) {
  try {
    yield* runLoop(params, input);
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      yield { type: 'budget.exceeded', kind: e.kind, spent: e.spent, limit: e.limit };
    }
    throw e;
  }
}
```

---

## 10. Tool System

### `agent/src/tool.ts`

The `tool()` helper is an identity function for type inference:

```ts
export function tool<I, O>(def: Tool<I, O>): Tool<I, O> {
  return def;
}
```

### Tool Interface

```ts
export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  parameters: ZodType<I>;      // Zod schema — used for LLM tool schema + arg validation
  execute(args: I, ctx: ToolContext): Promise<O>;
  requireApproval?: 'always' | 'never' | ((args: I) => boolean);
}
```

- **`parameters`** — Zod schema served to the LLM as tool parameters AND used to validate args at runtime before `execute()`.
- **`requireApproval`** — `'always'` pauses for human approval, `'never'` (default) auto-approves, or a function for conditional approval.
- **`execute()` receives `ToolContext`** with `runId`, `conversationId`, and `signal`.

### Tool Result Handling

| Scenario              | What happens                                      |
|-----------------------|--------------------------------------------------|
| Tool returns value    | Stringified via `JSON.stringify`, sent as tool result |
| Tool throws `ToolError` | Becomes `isError: true` tool result              |
| Tool throws anything else | Wrapped in `ToolError`, becomes error result   |
| Tool throws `HandoffSignal` | Propagates — triggers agent handoff            |
| Unknown tool name     | Error result: `"Unknown tool: X"`                |
| Zod validation fails  | Error result: `"Validation error: path: msg"`    |

---

## 11. Graph Execution Engine

### `agent/src/graph/graph.ts`

The `graph()` function builds an `Agent` from a DAG of nodes and edges:

```ts
export function graph(def: GraphDef): Agent
```

**`GraphDef`:**

```ts
export interface GraphDef {
  nodes: GraphNode[];
  edges: GraphEdge[];
  entryNode: string;
  checkpointer?: Checkpointer;
}
```

**`GraphNode`** — each node is either an `Agent` (delegates to its stream) or a bare function:

```ts
export interface GraphNode {
  id: string;
  agent?: Agent;
  fn?: (state: Record<string, unknown>, ctx: RunContext) => Promise<Record<string, unknown>>;
}
```

**`GraphEdge`** — static or conditional routing:

```ts
export interface GraphEdge {
  from: string;
  to: string | ((state: Record<string, unknown>) => string);
}
```

### Internal State

```ts
interface GraphState {
  currentNode: string;
  data: Record<string, unknown>;   // shared mutable state across all nodes
  completed: boolean;
}
```

### Execution Flow

```ts
async function* stream(input, opts): AsyncGenerator<AgentEvent, void> {
  // 1. Initialize state from input (or resume from checkpoint)
  let graphState: GraphState = {
    currentNode: def.entryNode,
    data: { ...input },     // input fields become initial state
    completed: false,
  };

  if (def.checkpointer) {
    const saved = await def.checkpointer.load(runId);
    if (saved?.graphState) {
      graphState = saved.graphState;  // resume from where we left off
    }
  }

  // 2. Execute nodes until done
  while (!graphState.completed) {
    if (signal.aborted) {
      yield { type: 'abort', reason: signal.reason };
      return;
    }

    const node = nodeMap.get(graphState.currentNode);

    try {
      if (node.agent) {
        // Delegate to the node's agent — yield all its events
        for await (const ev of node.agent.stream(agentInput, { signal, runId })) {
          yield ev;
        }
      } else if (node.fn) {
        // Run the node function — it mutates state by returning new data
        graphState.data = await node.fn(graphState.data, ctx);
      }
    } catch (e) {
      if (e instanceof InterruptSignal) {
        // HITL: save checkpoint and return (generator ends, waiting for resume)
        if (def.checkpointer) {
          await def.checkpointer.save(runId, { ..., graphState });
          yield { type: 'checkpoint', runId, turn: step };
        }
        return;
      }
      throw e;
    }

    // 3. Resolve edge to find next node
    const edge = edgeMap.get(graphState.currentNode);
    if (!edge) {
      graphState.completed = true;  // no outgoing edge = terminal node
      break;
    }

    const nextNode = typeof edge.to === 'function' ? edge.to(graphState.data) : edge.to;

    if (nextNode === '__end__') {
      graphState.completed = true;
    } else {
      graphState.currentNode = nextNode;
      yield { type: 'handoff', from: previousNode, to: nextNode };
    }

    // 4. Checkpoint after each node transition
    if (def.checkpointer && !graphState.completed) {
      await def.checkpointer.save(runId, { ..., graphState });
      yield { type: 'checkpoint', runId, turn: step };
    }
  }

  // 5. Final checkpoint on completion
  if (def.checkpointer && graphState.completed) {
    await def.checkpointer.save(runId, { ..., graphState });
  }
}
```

Key properties:
- **State flows through `graphState.data`** — each node reads from it and returns an updated copy.
- **`InterruptSignal` pauses execution** — checkpoints the current state and returns. The runner can resume by calling `stream()` again (the checkpointer restores `graphState`).
- **Handoff events emitted on every node transition**.
- **Validation at construction time** — duplicate edges, missing nodes, and invalid entry nodes all throw immediately.

---

## 12. Interrupt & Checkpoint System

### `agent/src/graph/interrupt.ts`

```ts
export class InterruptSignal {
  constructor(public readonly reason?: string) {}
}

export function interrupt(reason?: string): never {
  throw new InterruptSignal(reason);
}
```

`interrupt()` is called inside a graph node function to pause execution. The graph catches it, saves state via checkpointer, and returns.

### `agent/src/checkpoint/memory.ts`

The in-memory checkpointer:

```ts
export function inMemoryCheckpointer(): Checkpointer {
  const store = new Map<string, RunState>();

  return {
    async save(runId, state) {
      store.set(runId, structuredClone(state));  // deep clone to prevent mutation
    },
    async load(runId) {
      const state = store.get(runId);
      return state ? structuredClone(state) : null;
    },
    async list(conversationId) { ... },
  };
}
```

**`RunState`** — the full checkpoint payload:

```ts
export interface RunState {
  runId: string;
  conversationId: string;
  turn: number;
  messages: Message[];
  pendingApprovals?: PendingApproval[];
  graphState?: unknown;     // opaque — used by graph to store GraphState
}
```

### Resume Flow

When the session runner calls `agent.stream()` again after an interrupt:
1. Graph's `stream()` loads checkpoint via `def.checkpointer.load(runId)`
2. `graphState` is restored (including `currentNode`, `data`, `completed`)
3. Execution resumes from the interrupted node

---

## 13. Handoff & Subagent Composition

### `agent/src/handoff/handoff.ts`

**`HandoffSignal`** — a special throw that transfers control to a different agent:

```ts
export class HandoffSignal {
  constructor(
    public readonly target: Agent,
    public readonly carry?: HandoffState,  // state to pass to the target
  ) {}
}
```

**`handoff()`** — creates a tool that throws `HandoffSignal` when called:

```ts
export function handoff(target: Agent, carry?, opts?): Tool<{ reason: string }, string> {
  return {
    name: opts?.name ?? `handoff_to_${targetId}`,
    description: 'Transfer the conversation to another agent',
    parameters: z.object({ reason: z.string() }),
    execute() { throw new HandoffSignal(target, carry); },
  };
}
```

**`createHandoffAgent()`** — wraps a source agent to handle handoffs:

```ts
export function createHandoffAgent(sourceAgent: Agent): Agent {
  async function* stream(input, opts) {
    let currentAgent = sourceAgent;
    let currentInput = input;

    for (;;) {
      try {
        yield* currentAgent.stream(currentInput, opts);
        return;   // completed normally
      } catch (e) {
        if (e instanceof HandoffSignal) {
          yield { type: 'handoff', from: 'source', to: 'target' };
          currentAgent = e.target;
          currentInput = { ...currentInput, ...(e.carry ?? {}) };
          continue;  // re-enter the loop with the new agent
        }
        throw e;
      }
    }
  }
}
```

### `agent/src/tools/subagent.ts`

**`subagentAsTool()`** — wraps a child agent as a tool (used by the researcher):

```ts
export function subagentAsTool(child: Agent, spec: SubagentSpec): Tool<{ input: string }, string> {
  return {
    name: spec.name,
    description: spec.description,
    parameters: z.object({ input: z.string() }),
    async execute(args, ctx) {
      const result = await child.run(
        { conversationId: crypto.randomUUID(), userMessage: args.input },
        { signal: ctx.signal },
      );
      return typeof result.finalMessage === 'string'
        ? result.finalMessage
        : JSON.stringify(result.finalMessage);
    },
  };
}
```

Each invocation gets a fresh `conversationId` — the sub-agent has its own isolated conversation history.

---

## 14. Memory: Conversation Store

### `agent/src/memory/store.ts`

```ts
export interface ConversationStore {
  load(conversationId: string): Promise<Message[]>;
  append(conversationId: string, messages: Message[]): Promise<void>;
}
```

**`inMemoryStore()`** — simple `Map<string, Message[]>`:

```ts
export function inMemoryStore(): ConversationStore {
  const data = new Map<string, Message[]>();
  return {
    async load(id) { return [...(data.get(id) ?? [])]; },
    async append(id, msgs) {
      const existing = data.get(id) ?? [];
      data.set(id, [...existing, ...msgs]);
    },
  };
}
```

Memory is used in the loop:
1. **On start**: `messages = memory.load(conversationId)` — restores full history
2. **After user message**: `memory.append(conversationId, [userMsg])`
3. **After each turn**: `memory.append(conversationId, [assistantMsg, ...toolResultMsgs])`

This means a sub-agent with its own `inMemoryStore()` accumulates context across all its LLM turns within a single `execute()` call.

---

## 15. Compaction

### `agent/src/compaction/compactor.ts`

When the conversation gets too long, the compactor summarizes old messages:

```ts
export function summarizingCompactor(opts?: SummarizingCompactorOpts): Compactor
```

**Algorithm:**

1. Estimate token count of all messages using `gpt-tokenizer`
2. If under `maxTokens` (default: 80,000), return unchanged
3. Split into system messages + non-system messages
4. Keep the last N non-system messages (default: 4)
5. Summarize the rest by calling the LLM provider:
   ```
   System: "Summarize the following conversation concisely, preserving key facts and decisions."
   User: <all messages to summarize, capped at 200K chars>
   ```
6. Replace old messages with a single summary message:
   ```
   [Summary of previous 12 messages]: <LLM summary>
   ```

The compactor is called at the **start of each turn**, before the provider call.

---

## 16. Cache Breakpoints

### `agent/src/cache.ts`

Inserts `cacheBoundary: true` on messages to enable prompt caching:

```ts
export function insertCacheBreakpoints(messages: Message[], provider: Provider): Message[] {
  if (!provider.capabilities.caching) { return messages; }  // no-op if provider doesn't support it

  // Find the last system message and mark it as the cache boundary
  // Only one boundary is inserted; if one already exists, skip
}
```

Prompt caching allows the provider to reuse previously computed KV caches for the prefix of the conversation, significantly reducing latency and cost for multi-turn interactions.

---

## 17. Budget Tracking

### `agent/src/budgets/tracker.ts`

```ts
export function createBudgetTracker(limits: BudgetLimits, bus?: EventBus): BudgetTracker
```

Tracks two dimensions:
- **USD** — updated via `bus.on('provider.usage')` when `costUSD` is present
- **Tokens** — updated via `hooks.updateBudget(usage)` in the loop after each provider call

**`check()`** throws `BudgetExceededError` if either limit is exceeded. Called:
1. At the start of each turn (`hooks.checkBudget()`)
2. After each usage update (`hooks.updateBudget()` calls `check()` internally)
3. Via bus listener when `costUSD` is reported

### Deep Research Budget Split

The deep research tool splits its total budget across phases:

```ts
export const DEFAULT_BUDGET_RATIOS: BudgetRatios = {
  planner: 0.1,      // 10% for planning
  researcher: 0.6,   // 60% for research (the heavy phase)
  writer: 0.2,       // 20% for writing
  factChecker: 0.1,  // 10% for fact-checking
};
```

Only the researcher sub-agent currently receives budget limits (via `createAgent({ budgets })`)

---

## 18. Guardrails

### `agent/src/guardrails/hooks.ts`

**Input guardrails** run before each provider call:

```ts
export type InputHook = (input: { messages: Message[]; ctx: RunContext }) => Promise<
  | { action: 'pass' }                           // continue normally
  | { action: 'block'; reason: string }          // throw GuardrailError
  | { action: 'rewrite'; messages: Message[] }   // replace messages
>;
```

**Output guardrails** run after the LLM response (only when there are no tool calls):

```ts
export type OutputHook = (output: { message: Message; ctx: RunContext }) => Promise<
  | { action: 'pass' }
  | { action: 'block'; reason: string }
  | { action: 'rewrite'; message: Message }
>;
```

Both emit `guardrail` bus events. Multiple hooks run sequentially — first `block` or `rewrite` wins.

### Citation Check Guardrail

The deep research app includes a citation check output hook:

```ts
export function citationCheckHook(fetchedUrls: Set<string>): OutputHook {
  return async ({ message }) => {
    const cited = extractUrls(text);
    const unfetched = cited.filter(u => !fetchedUrls.has(u));
    if (unfetched.length === 0) { return { action: 'pass' }; }
    return { action: 'block', reason: `Report cites ${unfetched.length} URL(s) not found in sources` };
  };
}
```

---

## 19. Approval Registry (Tool-Level HITL)

### `agent/src/approval.ts`

For tool-level human-in-the-loop (distinct from graph-level plan approval):

```ts
export function createApprovalRegistry(opts?: ApprovalRegistryOpts): ApprovalRegistry
```

**`waitForApproval()`** returns a Promise that blocks the loop until a human resolves:

```ts
async function waitForApproval(approvalId, toolName, args): Promise<ApprovalDecision> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Approval timed out after ${timeoutMs}ms`));
    }, timeoutMs);   // default: 5 minutes

    pending.set(approvalId, { resolve: (d) => { clearTimeout(timer); resolve(d); }, ... });
  });
}
```

**`ApprovalDecision`:**

```ts
export type ApprovalDecision =
  | { type: 'approve'; approve: true }
  | { type: 'reject'; approve: false; reason?: string }
  | { type: 'approve-with-args'; approve: true; modifiedArgs: unknown };
```

If rejected, the tool call becomes an error result. If approved with modified args, the tool executes with the new args.

---

## 20. Stream Renderer

### `agent/src/stream-renderer.ts`

A utility for consuming agent streams with callbacks (used by CLI apps, not the web UI):

```ts
export function createStreamRenderer(callbacks: StreamRendererCallbacks): StreamRenderer {
  return {
    async render(stream) {
      for await (const event of stream) {
        dispatch(callbacks, event, accText, accUsage, accTurn);
      }
      return { text, turns, usage, durationMs };
    },
  };
}
```

The `dispatch()` function is an exhaustive switch over all `AgentEvent` types — TypeScript's `never` check ensures new event types are handled.

---

## 21. Observability: Console Sink

### `packages/observability/src/console-sink.ts`

Subscribes to the EventBus and logs formatted messages to `console.log`:

```ts
export function consoleSink(bus: EventBus, opts?: ConsoleSinkOpts): () => void
```

**Log levels** control which events are printed:

| Level     | Events                                                                |
|-----------|-----------------------------------------------------------------------|
| `silent`  | nothing                                                               |
| `quiet`   | `run.start`, `run.finish`, `run.error`, `budget.exceeded`            |
| `normal`  | + `turn.*`, `tool.*`, `guardrail`, `handoff`, `compaction`, `checkpoint` |
| `verbose` | + `provider.call`, `provider.usage`, `provider.retry`, `structured.repair` |

Output format: `[category] message`, e.g.:
```
[run] started a1b2c3d4
[turn] 1
[tool] fetch called
[tool] fetch done · 234ms
[turn] 1 done · 1523 tokens
[run] done · 1523 tokens · 1 turns
```

---

## 22. Deep Research: End-to-End Walkthrough

The `deep-research` tool in web-studio builds a **graph agent** with 6 nodes. Here's exactly what happens when a question is submitted:

### Step 1: Tool Definition

```ts
// deep-research/index.ts
export const deepResearchToolDef: ToolDef = {
  id: 'deep-research',
  settingsSchema: z.object({
    model: z.string().default('openrouter/free'),
    depth: z.enum(['shallow', 'medium', 'deep']).default('medium'),
    budgetUsd: z.number().min(0).default(0.5),
    maxTokens: z.number().int().min(1000).default(200_000),
    concurrency: z.number().int().min(1).max(10).default(3),
    hitl: z.boolean().default(false),
    plannerPrompt: z.string().optional(),
    writerPrompt: z.string().optional(),
    factCheckerPrompt: z.string().optional(),
  }),
  buildAgent(args) { ... },
};
```

### Step 2: `buildAgent()` Execution

```ts
buildAgent(args) {
  const budgets = splitBudget({ usd: settings.budgetUsd, tokens: settings.maxTokens });
  const tools = await createSearchTools({ signal });   // → [fetchTool({ allow: [/^https:\/\//] })]
  const agent = createResearchGraph({
    provider, tools, depth, skipApproval: !settings.hitl,
    checkpointer, store, budgets, events,
    plannerPrompt, writerPrompt, factCheckerPrompt,
  });
  return { stream: (input, opts) => agent.stream(input, opts) };
}
```

### Step 3: Graph Construction

```ts
graph({
  nodes: [planNode, approveNode, researchNode, writeNode, factCheckNode, finalizeNode],
  edges: [
    { from: 'plan', to: 'approve' },
    { from: 'approve', to: 'research' },
    { from: 'research', to: 'write' },
    { from: 'write', to: 'fact-check' },
    { from: 'fact-check', to: (state) =>
        state.factCheckPassed || state.factCheckRetries >= 2 ? 'finalize' : 'write'
    },
  ],
  entryNode: 'plan',
  checkpointer,
});
```

### Step 4: Plan Node

```ts
// agents/planner.ts
fn: async (state, ctx) => {
  const result = await provider.generate({
    messages: [
      { role: 'system', content: PLANNER_PROMPT },
      { role: 'user', content: `<user_question>${question}</user_question>\nGenerate exactly ${targetCount} subquestions.` },
    ],
    responseFormat: ResearchPlan,  // Zod schema → structured output
  }, ctx.signal);

  const plan = parseModelJson(text, ResearchPlan);
  return { ...state, plan };
};
```

**`ResearchPlan` schema:**

```ts
z.object({
  question: z.string().min(1),
  subquestions: z.array(z.object({
    id: z.string(),
    question: z.string().min(1),
    searchQueries: z.array(z.string()).default([]),
  })).min(1),
})
```

`targetCount` depends on depth: shallow=3, medium=5, deep=8.

### Step 5: Approve Node

```ts
fn: async (state) => {
  if (skipApproval || state.approved) { return state; }
  interrupt('plan-approval');   // throws InterruptSignal
};
```

If HITL is enabled, this pauses the graph. The session runner detects the pause, emits `hitl-required` with the plan, and waits for user approval. On approval, the runner calls `stream()` again — the graph resumes from checkpoint with `approved: true`.

If HITL is disabled (`skipApproval: true`), this is a no-op pass-through.

### Step 6: Research Node

```ts
fn: async (state, ctx) => {
  const researcherTool = createResearcherTool(provider, tools, { memory, budgets, events });

  // Run ALL subquestions in parallel
  const findings = await Promise.all(
    plan.subquestions.map(async (sq) => {
      const result = await researcherTool.execute(
        { input: `[${sq.id}] ${sq.question}` },
        toolCtx,
      );
      return FindingSchema.parse(JSON.parse(result));
    }),
  );
  return { ...state, findings };
};
```

Each `researcherTool.execute()` call spins up a **full sub-agent** (via `subagentAsTool`):

```ts
// agents/researcher.ts
const agent = createAgent({
  provider,
  systemPrompt: SUBQUESTION_PROMPT,
  tools,            // [fetchTool]
  memory: inMemoryStore(),
  maxTurns: 15,     // up to 15 LLM round-trips per subquestion
  budgets,          // researcher's slice of the budget
  events,           // shared EventBus (events bubble up)
});
return subagentAsTool(agent, { name: 'researcher', description: '...' });
```

Each researcher sub-agent independently:
1. Reads the subquestion
2. Decides what URLs to fetch
3. Calls the `fetch` tool (with HTTPS-only policy)
4. Reads the response
5. Iterates (up to 15 turns) until it has enough info
6. Returns a JSON `Finding` with summary + source URLs

### Step 7: Write Node

```ts
fn: async (state, ctx) => {
  const findingsText = findings.map(f => `[${f.subquestionId}]: ${f.summary}\nSources: ...`).join('\n\n');

  // If this is a retry after failed fact-check, include the issues as hints
  const issuesHint = state.factCheckIssues?.length > 0
    ? `\n\nIMPORTANT — fix these issues:\n${issues.map(i => `- ${i}`).join('\n')}`
    : '';

  const report = await generateReport(provider, `${findingsText}${issuesHint}`, signal, { systemPrompt });
  const reportText = reportToMarkdown(report);
  return { ...state, report, reportText };
};
```

`generateReport()` calls `provider.generate()` with `responseFormat: ReportSchema` (structured output):

```ts
z.object({
  title: z.string().min(1),
  sections: z.array(z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
  })).min(1),
  references: z.array(z.object({
    url: z.string().url(),
    title: z.string().optional(),
  })).default([]),
})
```

### Step 8: Fact-Check Node

```ts
fn: async (state, ctx) => {
  const retries = (state.factCheckRetries ?? 0) + 1;

  // Cross-check: URLs cited in report vs URLs found in research
  const citedUrls = extractUrls(state.reportText);
  const unfetchedUrls = citedUrls.filter(u => !allSourceUrls.has(u));

  let prompt = `Research sources:\n${sourceContext}\n\nVerify citations in this report:\n\n${state.reportText}`;
  if (unfetchedUrls.length > 0) {
    prompt += `\n\nWARNING: These URLs appear in the report but were NOT found in sources: ${unfetchedUrls.join(', ')}`;
  }

  const result = await checkFacts(provider, prompt, signal);
  return { ...state, factCheckPassed: result.pass, factCheckRetries: retries, factCheckIssues: result.issues };
};
```

`checkFacts()` uses structured output with:

```ts
z.object({
  pass: z.boolean(),
  issues: z.array(z.string()).default([]),
})
```

### Step 9: Conditional Edge

```ts
{ from: 'fact-check', to: (state) => {
  if (state.factCheckPassed || state.factCheckRetries >= 2) {
    return 'finalize';   // accept the report
  }
  return 'write';        // re-write with fact-check feedback
}}
```

Max 2 retries. If the fact-check still fails after 2 retries, the report is accepted as-is.

### Step 10: Finalize Node

```ts
{ id: 'finalize', fn: async (state) => state }
```

No-op. No outgoing edge → graph completes.

---

## 23. Fetch Tool

### `packages/tools/src/fetch.ts`

The only built-in tool. Used by researcher sub-agents to access the web.

```ts
export function fetchTool(opts?: FetchUrlPolicy): Tool<FetchArgs, string>
```

**Parameters (Zod schema):**

```ts
z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
})
```

**Security policies:**

1. **Scheme allowlist** — only `http:` and `https:` allowed
2. **Private IP blocking** — `127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `::1`, `fc/fd/fe80` prefixes, `localhost`, `*.local` all blocked
3. **URL policy** — configurable `allow`/`deny` lists. Deep research sets `allow: [/^https:\/\//]` (HTTPS only)
4. **Manual redirect handling** — follows up to 5 redirects, re-checking URL policy at each hop. 307/308 preserve method+body, 303 and others downgrade to GET
5. **Body cap** — reads at most 1MB of response body

**Return value:**

```ts
JSON.stringify({
  status: res.status,
  headers: { "content-type": "text/html", ... },
  body: "<first 1MB of response body>"
})
```

---

## Appendix: Abort Signal Propagation

`AbortSignal` flows top-down through the entire stack:

```
Session Runner (AbortController)
  └→ graph.stream(input, { signal })
      └→ GraphNode.fn(state, ctx)          ← ctx.signal
          └→ createAgent → runLoop → provider.stream(req, signal)
              └→ AI SDK → fetch(url, { signal })
      └→ Tool.execute(args, { signal })
          └→ fetchTool → fetch(url, { signal })
```

When the user clicks "Stop":
1. `POST /api/sessions/:id/cancel` → `abortController.abort()`
2. Every in-flight `fetch()`, `provider.stream()`, and `tool.execute()` receives the abort
3. `assertNotAborted(signal)` checks at the top of each loop turn catch it
4. The generator's catch block handles `AbortError` → emits cancelled status

---

## Appendix: Cost Tracking

### `core/src/cost.ts`

`trackCost()` listens to `provider.usage` events and calculates USD cost based on a price book:

```ts
export function trackCost(bus: EventBus, prices: PriceBook): () => void
```

Cost formula:
- **Regular input**: `(inputTokens - cachedInputTokens) / 1M * inputPerMTok`
- **Cached input**: `cachedInputTokens / 1M * cachedInputPerMTok`
- **Regular output**: `(outputTokens - reasoningTokens) / 1M * outputPerMTok`
- **Reasoning output**: `reasoningTokens / 1M * thinkingPerMTok`

The calculated `costUSD` is mutated directly onto the `provider.usage` event payload, making it available to the budget tracker and UI.
