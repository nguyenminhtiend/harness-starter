# Architecture Review — 2026-04-21

**Scope:** `packages/*` and `apps/web-studio` (layering, packaging, observability, error/retry, deep-research graph, eval). Reference points: **LangGraph-JS**, **Vercel AI SDK v5**, **OpenAI Agents SDK**, **Mastra**, **Inspect AI** — i.e. what the broader TS agent community converged on in 2025–26.

Assessment-only. No code changes in this doc.

---

## 1. Verdict at a glance

| Area | Rating | Summary |
| --- | --- | --- |
| Package DAG & boundary enforcement | **A** | DAG enforced in `biome.json` via `noRestrictedImports` — rare and correct. Runtime boundary (`core` = web-standard APIs only) is architecturally sound. |
| Public surfaces (`src/index.ts`) | **A-** | Clean barrel exports, consistent `import type` discipline. |
| Core types (`provider`, `events`, `errors`, `retry`) | **A** | Strong. Mirrors AI SDK v5 shapes, adds typed `HarnessEvents` and a proper error hierarchy with `retriable`/`retryAfter`. |
| Packaging granularity (`hitl`, `session-store`, `session-events`) | **C+** | Three new ~300 LOC packages with one real consumer today. Boundary cost > reuse cost until a second consumer exists. |
| web-studio server (feature-sliced) | **B+** | Good factory-based route pattern, colocated features. Hurt by nested `features/tools/deep-research/...` and a real UI-event double-emit bug. |
| web-studio client | **B** | React 19 + Query + Vite is fine; `App.tsx` is 546 lines and mixes 5 concerns; mutations don't use React Query. |
| Observability adapters | **A-** | OTel + Langfuse + console + JSONL, all bus-driven. Consistent lifecycle handling. Not wired into web-studio. |
| Error / retry | **A-** | Proper exponential backoff + jitter + `Retry-After`, abort-aware. Default retry policy is sensible. |
| Deep-research graph | **B** | Works, HITL via `interrupt()` checkpoint is nice. Retry-on-invalid-JSON is ad-hoc; no `responseFormat` path; budget split is a static ratio. |
| `@harness/eval` | **B+** | Minimal wrapper over `evalite` + Langfuse/Inspect-log exporters. Good scope discipline. LLM judge has a known weakness (no self-consistency). |
| Tests | **A-** | TDD in `packages/*`, tests-after in `apps/*`, colocated `*.test.ts`. No mocks of `Provider`. Textbook. |

Overall: **solid foundation, a handful of fixable bugs, and a packaging decision to revisit now while the blast radius is small.**

---

## 2. Package-by-package layering

### 2.1 DAG enforcement

`biome.json:71-337` is the star of the show — each package has a `noRestrictedImports` override listing what it *cannot* import. This is how layering actually survives contact with a growing team.

**Two caveats:**

1. **Denylist, not allowlist.** Every new package requires editing every other package's restricted list. Expected edits per new package: `O(packages)`. An allowlist-per-package (what's *allowed*) scales better at `O(1)`. 2026 equivalent tools: [`dependency-cruiser`](https://github.com/sverweij/dependency-cruiser) with a `forbidden` + `allowed` ruleset, or [`sherif`](https://github.com/QuiiBz/sherif) for workspace constraints. Either would let you declare the DAG once and verify it, instead of maintaining N× denylists.
2. **Missing `tsconfig references`.** `CLAUDE.md:42` acknowledges this. Incremental `tsc --build` would be faster than `tsc --noEmit` per package, and `references` gives TS itself a DAG to complain about. Low cost, high payoff.

### 2.2 Package-by-package

**`@harness/core`** (provider, events, errors, retry, abort, cost, config, testing).
`src/index.ts` has dangling `// Errors` / `// Abort` section comments that don't describe the blocks below them — noise from a refactor (`index.ts:1-5`). Otherwise: clean. `retry.ts` is solid — abort-aware `setTimeout`, `Retry-After` ms (explicitly documented at `retry.ts:39-44`), full jitter. Matches industry best practice.

**`@harness/agent`** (loop, graph, handoff, subagent, compactor, checkpointer, budgets, guardrails, approval).
- `src/types.ts` is a 205-line kitchen-sink. Splitting into `types/{agent,tool,store,guardrail,graph}.ts` would reduce re-import churn and make "what does an Agent expose" easier to answer.
- `loop.ts:478-486` puts the approval policy (always/never/function) on the `Tool` interface itself. Fine for v1, but it couples the tool surface to HITL policy; most frameworks (Agents SDK, Mastra) keep the policy on the *agent config* keyed by tool name, so the same tool can have different approval rules in different agents.
- `graph.ts:38` accepts `'__end__'` as a sentinel target. Magic strings → export a constant (e.g. `END`) and use it in tests/docs. LangGraph does exactly this.
- `handoff.ts:13` uses an **exception as control flow** (`HandoffSignal` thrown from `execute`, caught in the loop). Works, but it makes stack traces noisy and `Promise.allSettled` branches in `loop.ts:386-388` have to special-case it. OpenAI Agents SDK models handoff the same way; it is community-standard, just document the gotcha.

**`@harness/tools`** — `fetchTool` + `fsTool`. Small, focused, correct.

**`@harness/mcp`** — JSON-Schema → Zod bridge + MCP adapter. Focused.

**`@harness/memory-sqlite`** — `store` + `checkpointer`. Correctly Bun/Node-only.

**`@harness/llm-adapter`** (new).
`provider.ts:15-48` is a three-branch `if` over `ProviderId`. Adding a fourth provider is four touches (type union + `ProviderKeys` field + env loader + `if` branch). A registry pattern:

```ts
const providers: Record<ProviderId, (key: string, model: string) => Provider> = { ... };
```

…would make providers pluggable and isolate the known-model catalog from the factory. Also: `parseModelSpec` in `provider.ts:7-13` silently defaults to `openrouter` when there's no `:` — that's a magic default. Either require the prefix or make the default explicit (`DEFAULT_PROVIDER: ProviderId = 'openrouter'`).

**`@harness/session-store`** (new, ~170 LOC).
- Table is `runs` (`schema.ts:2`), type is `SessionRow` (`types.ts:3`), bind params use `$runId`/`$toolId`. Pick one name (`session` or `run`) and use it consistently — this drift will bite in SQL queries later.
- `listSessions` clamps `limit` inside the store (`session-store.ts:95-97`). That's input validation; it belongs in the route schema. Storage should trust its caller.
- `seqCounters` is an in-memory `Map<string, number>` (`session-store.ts:34`). Two `SessionStore` instances on the same DB race each other. Document "single-process only" in a JSDoc, or derive `seq` from `MAX(seq)+1` on every insert via SQL (slower but safe).
- Schema has `costUsd` / `totalTokens` columns but `updateSession` can't write them (`types.ts:19-22`). Either wire the columns up or drop them.

**`@harness/session-events`** (new, ~140 LOC).
- `bridge.ts` has two functions — `agentEventToUIEvents` (stream path) and `bridgeBusToUIEvents` (bus path). **Bug described in §3.1.**
- `SessionMeta` is a re-export alias (`events.ts:3`). Fine, but the file is named `events.ts` — if this is the package's primary type, the naming is misleading.

**`@harness/hitl`** (new, ~80 LOC).
Two trivial `Map`-wrapping stores. `HitlRunSession` holds a `Checkpointer` + `AbortController` (`types.ts:9-12`). This is in-process, single-server only — document the constraint or the package name promises more than it delivers.

**`@harness/observability`**.
OTel/Langfuse/console/JSONL sinks, all bus-driven. Quality is high: `otel-adapter.ts:15-39` cleans up open spans on `run.finish`/`run.error` per run, which is a common miss. `console-sink.ts` has `silent|quiet|normal|verbose` levels — matches Mastra/AI SDK conventions.
**Not wired into web-studio** at all (grep: no `from '@harness/observability'` imports anywhere in `apps/*`). The dependency is declared in `apps/web-studio/package.json:17` but no code imports it. Either wire it up or remove the dep.

**`@harness/eval`** — see §6.

**`@harness/cli`** — straightforward Evalite/harness bridge. Fine.

**`@harness/tui`** — only used via subpath imports (`@harness/tui/spinner` etc., `cli-chat/src/index.ts:3-5`). Barrel at `src/index.ts` exists but is unused. Either delete the barrel or document that subpath imports are preferred; don't leave both.

---

## 3. Bugs and architectural issues

### 3.1 **[Bug, confirmed]** UI events are double-emitted

In `apps/web-studio/src/server/features/sessions/sessions.runner.ts:76-112`, every run drives two parallel pipes into the UI event stream:

1. **Bus bridge** — `bridgeBusToUIEvents` subscribes to `tool.start`, `tool.finish`, `provider.usage`, `handoff` (`session-events/src/bridge.ts:82-131`).
2. **Stream converter** — `agentEventToUIEvents` converts the `AgentEvent` stream — which *also* yields `tool-start`, `tool-result`, `usage`, `handoff`.

`packages/agent/src/loop.ts:403-436` emits each tool lifecycle step on both the bus (`bus?.emit('tool.start', …)`) **and** the stream (`events.push({ type: 'tool-start', … })`). Same for `provider.usage` vs `usage`. Same for `handoff` from `graph.ts:124` (stream) vs `graph/graph.ts` bus emission elsewhere.

**Effect:** every tool invocation and every usage tick produces two `UIEvent`s, which are persisted twice to SQLite (`sessions.runner.ts:79-81`, `:108-112`) and pushed twice to the SSE subscriber. `text-delta` is only in the stream path, so it is *not* double-emitted — which makes this asymmetric and hard to spot in casual testing.

**Fix (assessment-level):** pick one pipeline.
- **Option A** — stream-only: keep `agentEventToUIEvents`, delete `bridgeBusToUIEvents` and the bus subscriptions in `sessions.runner.ts`. Simpler; matches the "stream-first" invariant in `CLAUDE.md:24`.
- **Option B** — bus-only: remove duplicate emits from `loop.ts` (make the stream events a derivation of the bus), and have web-studio consume only via the bridge. More decoupled, bigger refactor.

Recommendation: **Option A.** The bus is for external observers (observability sinks); UI events should be derived from the stream and enriched as needed. Reserve the bus for cross-cutting concerns the stream doesn't carry (e.g. guardrail verdicts).

### 3.2 **[Bug, minor]** Empty-string `toolName` in tool-result UI events

`session-events/src/bridge.ts:22-31` emits `toolName: ''` for `tool-result` / `tool-error`:

```ts
events.push({ ...base, type: 'tool', toolName: '', result: String(e.result), … });
```

The original `AgentEvent` only has `id`, not `name`. Either:
- Track a `Map<toolCallId, toolName>` in the bridge and populate it from prior `tool-start` events, OR
- Make `toolName` optional on `ToolEvent` and let the UI look it up.

Empty-string is a typed lie; the client can't distinguish "tool with no name" from "we lost the name."

### 3.3 **[Issue]** `inflight` Set is module-global in web-studio

```ts
// apps/web-studio/src/server/features/sessions/sessions.routes.ts:63
const inflight = new Set<string>();
```

It lives *outside* `createSessionsRoutes`. If the factory is called twice (tests, multi-tenant setup), they share state. Move inside the closure — the `activeSessions` map just below it is correctly scoped.

### 3.4 **[Issue]** `src/shared/tool.ts` imports server-only types

`apps/web-studio/src/shared/tool.ts:1-2` pulls `Agent`, `Checkpointer`, `ConversationStore`, `EventBus`, `Provider` into a file under `shared/`. The naming promises "safe for browser." Today those are type-only imports so Vite tree-shakes them; the day someone adds a runtime import (a factory, a helper), you have a Node-dep leak into the browser bundle.

Move `ToolDef` to `src/server/features/tools/types.ts`. `src/shared/` should contain only DTOs and Zod schemas that are safe on both sides.

### 3.5 **[Issue]** `src/shared/events.ts` declares unused event types

`PlannerEvent`, `ResearcherEvent`, `FactCheckerEvent` (`shared/events.ts:18-37`) extend the `UIEvent` union but nothing in the server emits them — grep confirms no construction sites. Either emit from the corresponding agents or delete; dead event types quietly grow into API drift.

### 3.6 **[Issue]** `@harness/observability` declared as dep but never imported

`apps/web-studio/package.json:17` lists `@harness/observability: workspace:*`. No file imports it. Either wire `consoleSink(bus)` / `otelAdapter(bus, tracer)` in `sessions.runner.ts`, or drop the dep.

### 3.7 **[Smell]** Planner/writer/fact-checker rely on JSON-in-system-prompt

`deep-research/agents/planner.ts:12-26` instructs the model with "Respond with ONLY valid JSON (no markdown fences…)" and retries up to 3 times. `@harness/core`'s provider interface already has `responseFormat: ZodType` (`provider/types.ts:66`) which the AI SDK-backed provider maps to structured output. The graph nodes bypass this and do string parsing with retry. Using `responseFormat` would:
- Delete ~30 lines of retry/parse boilerplate per agent.
- Surface repair attempts as `structured.repair` bus events (already typed in `events/bus.ts:38`).
- Eliminate the "valid JSON but wrong shape" failure mode.

This is the single biggest robustness win available in the deep-research graph.

### 3.8 **[Smell]** `splitBudget` static ratios

`deep-research/budgets.ts:13-18` hard-codes `planner: 0.1, researcher: 0.6, writer: 0.2, factChecker: 0.1`. This is a reasonable starting point but doesn't flow from any evidence. If you ship this as a template, make the ratios configurable per tool settings and log actual vs. budgeted consumption so users can tune.

### 3.9 **[Smell]** Compactor token estimate is `chars / 4`

`compaction/compactor.ts:50-57` approximates tokens as `Math.ceil(text.length / 4)`. Fine for English-text heuristics but wrong for non-Latin scripts and for the `JSON.stringify(content)` path (it inflates). `gpt-tokenizer` is already in the stack per `CLAUDE.md:7`. Use it here.

---

## 4. Packaging granularity — the real question

You said the three new packages **may** be reused by a future app (CLI or web) but **feel too small**. Let me lay out the tradeoff concretely:

### 4.1 Current cost of the split

| Package | LOC (src) | Real consumers today |
| --- | --- | --- |
| `session-store` | ~170 | `apps/web-studio` |
| `session-events` | ~140 | `apps/web-studio` |
| `hitl` | ~80 | `apps/web-studio` |
| **Total** | **~390 LOC** | **1** |

Maintenance cost per package: `package.json` + `tsconfig.json` + `src/index.ts` + 1 biome override block + 1 DAG slot to remember. Three packages = **12 boundary-maintenance surfaces for 390 LOC with one consumer.**

### 4.2 When the split pays off

Splitting pays when **a second consumer appears**. Specifically:
- A CLI app that needs persistent sessions with SQLite replay (→ needs `session-store`).
- A CLI or TUI that needs `UIEvent` projection (→ needs `session-events`).
- A CLI that needs HITL approval bridging (→ needs `hitl`).

### 4.3 Recommendation: **consolidate now, split later**

There are two reasonable shapes. I'd pick **Option B**.

**Option A — "one package, three modules":**
Merge all three into a new `@harness/session` with three submodule exports:

```
packages/session/
  src/
    store/...      → @harness/session/store
    events/...     → @harness/session/events
    hitl/...       → @harness/session/hitl
    index.ts
```

*Pro:* one package boundary, three cohesive modules, still reusable.
*Con:* you eventually need a browser-safe entry (events types are fine; store/hitl aren't). Conditional exports handle it.

**Option B — "fold into the one app that uses it, extract when second consumer appears":**
Move `session-store`, `session-events`, `hitl` into `apps/web-studio/src/server/infra/session/`. Delete the three packages. When the second consumer is ready, extract *based on what that consumer actually needs* (which may differ from today's API guesses).

*Pro:* YAGNI. Zero speculative API surface. Clone-and-own philosophy (`CLAUDE.md:37-39`) already says "delete `apps/*` must leave the rest building." Reusing from an app into another app can go via copy-paste, which is the stated model.
*Con:* if the second consumer really does arrive soon, you pay one extraction cost later instead of one consolidation cost now.

**Why B over A:** this project is `private: true`, clone-and-own, no npm publish (`CLAUDE.md:30`). The mechanism for sharing code across apps in this repo is **copy, not depend**. The whole `apps/web-studio/CLAUDE.md:16` "copy, don't import" rule for `deep-research` is the same idea. Putting session plumbing into the same app is consistent with that philosophy. If it turns out both apps need identical session wiring, *that is evidence* the API is right, and extraction is cheap. Extracting before evidence is how over-abstracted frameworks are born.

**Against B:** if you already know the second consumer is imminent (weeks, not quarters), Option A avoids churn.

### 4.4 What to keep as packages regardless

- `@harness/core`, `@harness/agent`, `@harness/tools`, `@harness/mcp`, `@harness/memory-sqlite`, `@harness/observability`, `@harness/eval`, `@harness/cli`, `@harness/tui`, `@harness/llm-adapter` — these have clear boundaries, meaningful size, and are used (or meant to be used) by multiple consumers. Keep.

---

## 5. web-studio — server and client

### 5.1 Server (Hono)

**What's good:**
- Feature slices (`features/sessions`, `features/settings`, `features/tools`) with colocated routes + store + tests. This is the 2026 standard for Hono/Fastify apps.
- Factory pattern `createApp(deps)` with explicit `AppDeps` (`server/index.ts:16-51`). Testable, no singletons.
- `infra/parse-body.ts` + `infra/broadcast.ts` + `infra/db.ts` — cross-cutting primitives pulled out cleanly.
- SSE replay from SQLite when the run is done (`sessions.routes.ts:166-187`). This is the pattern LangSmith/Langfuse use. Good.

**What to change:**
1. **Lift deep-research out of `features/tools/`.** The current path `features/tools/deep-research/agents/planner.ts` is 7 segments deep and nests a feature inside the "tools" feature. Two cleaner shapes:
   - `src/server/tools/deep-research/...` (tools are a sibling layer, not a feature) and `features/tools/` becomes just the registry route.
   - Or collapse: `src/server/features/deep-research/...` as a direct feature and expose it via the same registry.
2. **`activeSessions` state is a `Map` inside `createSessionsRoutes`** — correct. `inflight` (§3.3) is module-global — fix.
3. **SSE resume after disconnect.** Currently live streams send events from their current position; a reconnecting client loses anything emitted between disconnect and reconnect *while the run is still active*. Industry pattern: `Last-Event-ID` header + persisted `seq` (you already have `seq` in `events` table). Add replay-from-seq to the live stream case.
4. **Settings layering** (`settings.reader.ts:73-89`) is correct but scattered across `applyGlobalLayer`, `applyToolPersistenceLayer`, `mergeToolRuntimeSettings`, `maskSecretsForClient`. A single `resolveSettings(toolId, scope, request): { runtime, view }` would make the precedence chain (defaults → global → tool persistence → prompt-role storage → secret storage → request override) visible in one place.
5. **No rate limiting / request size limits.** Localhost-only binding (`config.ts:14`) mitigates this for v1, but a `body-size` middleware would be 10 lines and prevent accidental DoS from a malformed client.

### 5.2 Client (React 19 + TanStack Query + Vite 6)

**What's good:**
- Inline-style design tokens — simple and fast; consistent with local-first dev-tool aesthetic (Inspect AI, Langsmith). Fine at this size.
- `useSettings`, `useEventStream` as custom hooks. Good separation.
- Hash-based routing (`App.tsx:28-40`). Simple and correct for a single-window tool.

**What to change:**
1. **`App.tsx` is 546 lines** and owns: routing, sessions, HITL modal, keyboard shortcuts, toast, form state, retry. Industry-standard split:
   - `useSessionRouter()` — hash sync
   - `useSessionMutations()` — create / cancel / delete / approve via React Query `useMutation`
   - `useHotkeys({ onRun, onEscape })` — keyboard
   - `useHitlModal(stream)` — HITL state
   - `<AppShell>` → `<Sidebar>` + `<SessionPane>` + `<SettingsPane>` + `<HitlModal>` + `<Toaster>`
   - `App.tsx` becomes ~80 lines of composition.
2. **Mutations bypass React Query** (`App.tsx:156-251`). `api.createSession`, `api.cancelSession`, `api.deleteSession`, `api.approveSession` are called imperatively and `queryClient.invalidateQueries` is called manually. Converting to `useMutation` gives you:
   - Automatic pending/error state for UI.
   - `onSuccess` → `invalidateQueries` — one line instead of try/finally.
   - Retry policy out of the box.
3. **`submittingRef` + `streamErrorSeenRef`** (`App.tsx:115-127`) are workarounds for mutations-without-Query. Disappear once you move to `useMutation`.
4. **`deriveReportMarkdown(stream.events)` runs on every render** — memoized correctly (`App.tsx:105-108`) but the dep array uses `status` as a proxy for "stream.events is stable" with a `biome-ignore`. If you model `stream.events` as an immutable array (return a new ref when it changes), you can drop the escape hatch.
5. **`localStorage.getItem('harness:lastModel')` on first render** (`App.tsx:56`) — fine, but should go through `useSettings` for consistency. Settings in three places (localStorage, server global, server tool) is already one too many.

---

## 6. `@harness/eval`

**Scope is well-chosen:** wrap Evalite, ship a small set of scorers (`exactMatch`, `includes`, `finishedWithin`, `toolCalled`, `llmJudge`), and export results to Langfuse + Inspect AI's log schema (`export/langfuse.ts`, `export/inspect-log.ts`). Deliberately *not* a framework. Matches what a team would want.

**Things to tighten:**

1. **`createScorer` is a local reimplementation of Evalite's API** (`create-scorer.ts:27-30`, comment acknowledges it). That's fine for bun:test isolation, but the API will drift. Keep it single-source-of-truth: either re-export Evalite's type and *delegate* at import-time, or document that this is a *stable local shim* and add a contract test against Evalite's actual type.
2. **`llmJudge` has no self-consistency / no judge-model calibration** (`scorers/llm-judge.ts:15-65`). Industry standard in 2026: run N=3–5 judgments and take median or majority vote; optionally compare against a held-out human label for calibration. Single-call LLM judges are known-unreliable. Document this as a v1 limitation or add `n: number` option.
3. **`toInspectLog` returns `status: 'success'` unconditionally** (`export/inspect-log.ts:38`). If any sample errors, this is misleading. Thread through a status.
4. **No token-budget scorer** — given budgets are first-class in the agent config, `scoredBelowBudget({ usd, tokens })` is a natural scorer to add.
5. **No `evalite` runtime dep check.** `create-scorer.ts:27-30` says "Avoids importing evalite at runtime" but `index.ts:1` re-exports `evalite` — so end consumers still get it. That's correct, but the comment could mislead.

---

## 7. Error handling and retry — assessment

`packages/core/src/retry.ts` and `errors.ts` are among the strongest parts of this codebase.

**What's right:**
- **Discriminated error class** (`provider|tool|validation|guardrail|budget|loop`) with per-class fields (`ProviderError.kind`, `ToolError.toolName`, `BudgetExceededError.spent/limit`). `toJSON()` for structured logging. Matches the error taxonomy in both OpenAI Agents SDK and Mastra.
- **`retriable` flag + `RETRIABLE_PROVIDER_KINDS`** (`errors.ts:50`). Rate-limit / timeout / 5xx retry by default, auth / bad_request do not. Correct.
- **`Retry-After` is explicitly in milliseconds** with a JSDoc warning that HTTP `Retry-After` is seconds (`retry.ts:39-44`). This is the exact footgun that bites most implementations; documenting the unit is the right move.
- **Retries wrap provider calls only, never the outer loop** — enforced by construction (`retry.ts:58-125` is called from `loop.ts:322`, not around the whole turn). Matches `CLAUDE.md:27`.
- **Abort is observed mid-delay** (`retry.ts:98-119`) — the `setTimeout` promise rejects if the signal aborts. This is a common miss.
- **Full jitter** with `MIN_JITTER_DELAY_MS = 1`. Good.

**What's missing / to consider:**
- **No circuit breaker** — per `CLAUDE.md:34` this is an explicit non-goal. Good. (Community standard *does* include circuit breakers at higher layers; fine to punt.)
- **Retry policy is per-agent**, not per-tool. A flaky fetch tool and a flaky provider share the same retry story. `Tool` could grow an optional `retryPolicy?: Partial<RetryPolicy>`.
- **`ToolError` throws become tool-results with `isError: true`** per `CLAUDE.md:26` — correctly implemented in `loop.ts:443-456`. This is the right model (the model can react to the error); no change.
- **`LoopExhaustedError`** has no "final state snapshot" — if a loop hits max turns, the caller can't inspect partial usage/turns. Consider adding `usage` / `partialMessage` to the error.
- **`withRetry` returns the last error as-is** (`retry.ts:124`) without annotating it with `attempts`. A small `retryAttempts` field on the thrown error aids postmortem.

---

## 8. Observability — assessment

`packages/observability/` has four sinks, all driven by `EventBus`:

- **`consoleSink`** (`console-sink.ts`) — 4 verbosity levels; aligned with AI SDK's dev console.
- **`jsonlSink`** — structured logs; standard for log ingestion.
- **`otelAdapter`** — `run → turn → provider / tool` span hierarchy with per-run cleanup on `run.finish` / `run.error` (`otel-adapter.ts:14-39`). Uses `@opentelemetry/api` as a peer dep so apps control the SDK version.
- **`langfuseAdapter`** — traces + generations + spans with usage/cost metadata. Peer-dep on `langfuse@^3`.

**This is the shape industry converged on in 2026.** OTel for infra-standard tracing (goes to Honeycomb / Datadog / Tempo / Jaeger), Langfuse for LLM-native product analytics, JSONL for local/CI.

**Gaps:**

1. **Not wired into web-studio** (§3.6). Users can't get traces out of the box. The app doesn't even wire `consoleSink` for dev.
2. **No `thinking.start` / `thinking.finish` events** on the bus. `StreamEvent` has `thinking-delta` (`provider/types.ts:88`) but no bus counterpart, so reasoning tokens don't land in OTel spans or Langfuse. Extended-thinking models are core to 2026 agents; add a bus event.
3. **No cost summary on `run.finish`**. `provider.usage` fires per turn with `costUSD`, but `run.finish` (`events/bus.ts:21`) carries only `RunResult` with optional `usage`/`costUSD`. OTel/Langfuse adapters would benefit from a guaranteed end-of-run cost total — today it requires summing on the consumer side.
4. **`otel-adapter.ts:209` uses module-global `toolCallSeq`** to distinguish concurrent tool calls. Fine in practice but susceptible to drift if adapters are instantiated twice. Make it per-adapter.
5. **Langfuse adapter doesn't send prompt/completion content by default**. For dev, you want it on; for prod, off. Add a `redact?: 'none' | 'messages' | 'all'` option.

---

## 9. Deep-research graph — assessment

`apps/web-studio/src/server/features/tools/deep-research/graph.ts` builds a 6-node graph: `plan → approve → research → write → fact-check → finalize`, with fact-check looping back to write up to `MAX_FACT_CHECK_RETRIES = 2`.

**What's good:**
- **HITL via `interrupt('plan-approval')`** in the `approve` node (`graph.ts:70-72`). The checkpointer saves state, the generator returns, the server waits on `approvalStore.waitFor(sessionId)`, the graph resumes after the approval flips `approved: true`. Clean. This is the LangGraph pattern.
- **Plan → parallel researchers via `Promise.all`** (`graph.ts:94-106`). Correct shape.
- **Citation guardrail** — `extractUrls` + cross-check against `findings.sourceUrls` (`graph.ts:169-174`) is a sensible post-hoc check.

**What to change:**
- **Structured output bypass (§3.7).** Planner, researcher, writer, fact-checker all prompt-engineer JSON and retry. Use `responseFormat: ZodType` consistently and lose ~30 LOC per agent.
- **`researchNode` swallows parse errors** (`graph.ts:100-105`): if `FindingSchema.parse` fails, it fabricates `{ subquestionId, summary: rawString, sourceUrls: [] }`. That is a silent quality degradation; better to surface as a fact-check flag or a retry.
- **No cancellation mid-research**. `Promise.all` on 5–8 researchers means one runaway subquestion keeps the others blocked waiting. `AbortController.abort()` on first error + `Promise.allSettled` would be more resilient.
- **Fact-check loops back to `write`** but doesn't pass *what failed* back to the writer — the writer just regenerates from the same findings. Pipe `parsed.issues` into the writer's prompt on retry so it actually repairs the specific citation problems.
- **`budgets` are split statically** (§3.8) and not checked between nodes. A `budgetGate` node that short-circuits with `budget.exceeded` if the previous steps overshot would prevent expensive writer runs when research already blew the budget.
- **Graph state is `Record<string, unknown>`** (`types.ts:191`) — the file acknowledges this with `interface ResearchState { [key: string]: unknown; ... }` (`graph.ts:17-27`). This is the right escape hatch; just document that graph state is a dynamic bag and nodes own their keys.

---

## 10. Tests

`CLAUDE.md:73-79` enforces TDD in `packages/*`, tests-after in `apps/*`, colocated `*.test.ts`. Evidence:

- `packages/agent/src/create-agent.test.ts` (7.7 KB) for a 3.9 KB implementation — good test-to-code ratio.
- `packages/core/src/testing/fake-provider.ts` — scripted stream replay, used everywhere. The repo avoids mocking `Provider` (`CLAUDE.md:79`), which is the single most useful testing rule in an agent codebase.
- Eval specs in `*.eval.ts` are excluded from `bun test` via tsconfig — so `bun run ci` is fast.

**What's missing:**
- **No contract tests between `session-events` and `agent`** — if `AgentEvent` shape changes, `agentEventToUIEvents` silently falls through to `default: break;` (`bridge.ts:66`). A contract test (`for each agent event type, assert at least one UI event or an explicit skip`) would catch drift.
- **web-studio deep-research test is a single integration test** (`deep-research.test.ts`, 2KB). The graph has 5 nodes and conditional edges; per-node tests would catch regressions faster than end-to-end runs.
- **No abort tests end-to-end.** Aborting mid-stream is a critical user path (stop button). There are abort tests in `@harness/core`, but none that drive it through `sessions.runner → agent.stream → provider.stream → tool.execute`.

---

## 11. Prioritized action list

**P0 — correctness bugs:**
1. Fix double-emit of UI events (§3.1). Pick stream-only.
2. Fix empty-string `toolName` (§3.2).
3. Move `inflight` into `createSessionsRoutes` (§3.3).

**P1 — layering / architecture:**
4. Decide on session-store / session-events / hitl packaging (§4). Recommend: fold into `apps/web-studio/src/server/infra/session/`, extract when second consumer appears.
5. Move `shared/tool.ts` into server-only (§3.4). Delete unused event types in `shared/events.ts` (§3.5).
6. Wire `@harness/observability` into web-studio or drop the dep (§3.6).
7. Lift deep-research out of nested `features/tools/` path (§5.1).
8. Split `App.tsx` into hooks + components (§5.2).
9. Adopt `useMutation` for session operations (§5.2).

**P2 — robustness:**
10. Use `responseFormat` in deep-research agents (§3.7, §9).
11. Add SSE `Last-Event-ID` replay (§5.1).
12. Rename `runs` table / `SessionRow` to match (§2.2).
13. Swap `chars/4` compactor estimate for `gpt-tokenizer` (§3.9).
14. `thinking.*` bus events (§8).

**P3 — ergonomics:**
15. Replace denylist `noRestrictedImports` with `dependency-cruiser` allowlist (§2.1).
16. Add `tsconfig references` (§2.1).
17. Provider factory registry in `llm-adapter` (§2.2).
18. Self-consistency option for `llmJudge` (§6).
19. Contract tests between `agent` ↔ `session-events` (§10).

---

## 12. How this compares to the reference frameworks

| Dimension | This repo | LangGraph-JS | OpenAI Agents SDK | Mastra | Vercel AI SDK v5 |
| --- | --- | --- | --- | --- | --- |
| Stream-first | ✅ | ✅ | ✅ | ✅ | ✅ |
| Plain interfaces (no classes) | ✅ | partial | partial | ❌ (builder classes) | ✅ |
| Graph + agent composition | ✅ | ✅ (primary) | ⚠️ (handoff only) | ✅ | ❌ |
| HITL via checkpoint interrupt | ✅ | ✅ | ✅ | ✅ | ❌ |
| Typed event bus | ✅ | partial | ⚠️ | ✅ | ⚠️ |
| First-class budgets | ✅ | ❌ | ❌ | ❌ | ❌ |
| First-class guardrails | ✅ | ❌ | ✅ | ✅ | ❌ |
| Cost tracking | ✅ | ❌ | ⚠️ | ✅ | ✅ |
| OTel + Langfuse + Inspect AI | ✅ | partial | partial | ✅ | ✅ |
| Clone-and-own (no npm) | ✅ (unique) | ❌ | ❌ | ❌ | ❌ |

**Where this repo leads:** budgets, event-bus typing, clone-and-own philosophy, retry discipline.
**Where it trails:** graph ergonomics (LangGraph's type-checked state channels, interrupt-as-function, conditional-edge helpers), tool-call observability (Mastra's UI is further along), structured output ergonomics (AI SDK v5 streams partials of Zod schemas).

None of the gaps are architectural — they're features. The bones are right.

---

## 13. Open questions for the maintainer

1. **Is a second app imminent?** Answer determines whether §4 recommendation is A (consolidate to `@harness/session`) or B (fold into web-studio).
2. **Is the `HarnessEvents` bus considered stable API?** If yes, the double-emit fix should be bus-only (deprecate the stream duplication). If no, stream-only is simpler.
3. **Is Deep Research a template or a product?** Templates can ship as-is with docs; products need the structured-output refactor (§3.7) before any user sees a fabricated citation.
4. **Target deployment surface?** Localhost-only today. If this will ever ship behind a reverse proxy: revisit CORS, body limits, auth, SSE heartbeats, and `inflight` / `activeSessions` state (§5.1).

---

*Prepared for: maintainer review.
Author: architecture review pass, assessment-only.
No code changes made.*
