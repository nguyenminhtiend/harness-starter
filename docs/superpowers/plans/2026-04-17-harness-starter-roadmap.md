# Harness Starter — Roadmap Plan

> **Scope note:** This is a **roadmap** — it sequences the work and defines exit criteria per phase. Each phase points at a detailed per-package plan to be written (via `superpowers:writing-plans`) **immediately before** that phase is implemented. This file intentionally omits task-level code, test stubs, and commands — those belong in the per-package plan.
>
> **For agentic workers:** Do **not** execute this roadmap directly. Implement phase-by-phase: write the phase's detailed plan first, execute it via `superpowers:subagent-driven-development` or `superpowers:executing-plans`, then move to the next phase.

**Goal:** Build a TypeScript-first, clone-and-own starter for agentic AI systems per `docs/superpowers/specs/2026-04-17-harness-starter-design.md`.

**Architecture:** Layered modular monorepo on Bun workspaces. `core` (Web-API-only) defines Provider + event bus + config + errors. `agent` builds the loop, composition primitives, and pluggable interfaces on top. Sibling packages (`memory-sqlite`, `tools`, `mcp`, `observability`, `eval`, `cli`) each depend only on `core` and/or `agent`. Two demo apps exercise the stack.

**Tech Stack:** TypeScript 5.7 strict · Bun workspaces · Vercel AI SDK v5 · Zod v4 · Biome · Lefthook · Commitlint · Changesets · Evalite (Vitest) · Hono · `bun:sqlite` · `gpt-tokenizer`.

---

## Phase ordering rationale

Dependency direction (per spec §3):

```
core ─┬─> agent ─┬─> memory-sqlite
      │          ├─> tools
      │          ├─> mcp
      │          ├─> observability
      │          ├─> eval ─> cli
      │          └─> apps/*
      └─> (apps/*)
```

Phases follow this DAG. `tools` has no hard dep on `agent` internals beyond the `Tool` type, so it can slot in early once the type is stable. `observability` is scheduled after `agent` but before apps so the CLI chat demo can trace by default. Apps come after all packages they import.

---

## Phase 0 — Monorepo scaffold

**Delivers:** empty but fully-wired monorepo; `bun run ci` green with zero packages.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-0-monorepo-scaffold.md`

- [ ] Write phase-0 detailed plan
- [ ] Root `package.json` with Bun workspaces + scripts from spec §8
- [ ] `bunfig.toml`, `tsconfig.base.json` (strict flags per spec §8), `biome.json` (recommended + cross-package import restriction rule)
- [ ] `lefthook.yml` (pre-commit: biome + typecheck on staged; commit-msg: commitlint)
- [ ] `commitlint.config.ts` (Conventional Commits)
- [ ] Changesets init
- [ ] `.github/workflows/ci.yml` per spec §8
- [ ] Empty `packages/` + `apps/` directories with `.gitkeep`
- [ ] `docs/` skeleton (`architecture.md` stub linking to the spec; `adr/0001-use-bun-workspaces.md`)
- [ ] README with first-run instructions placeholder
- [ ] `.env.example` wiring convention documented

**Exit criteria:**
- `bun install` succeeds
- `bun run ci` passes on an empty workspace (lint, typecheck, build, test all no-op clean)
- CI workflow green on initial commit

---

## Phase 1 — `@harness/core`

**Delivers:** Provider interface + AI-SDK-backed impl, event bus, config, errors, retry, cost, abort utilities, `fakeProvider()` test helper.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-1-core.md` — expect this to be the most design-dense plan. Break into sub-plans if it grows past ~15 tasks.

**Covers spec sections:** §4 `@harness/core`, §6 error taxonomy, retry policy, §7 event catalog (types only — no sinks yet).

**Sub-themes (per-package plan should split these into separate task clusters):**
1. Error hierarchy (`HarnessError` and subclasses)
2. `Provider`, `ProviderCapabilities`, `GenerateRequest`, `Message`, `StreamEvent` types
3. `aiSdkProvider(model, opts)` — Vercel AI SDK v5 wrapper; must surface caching/thinking/batch/structured-stream capabilities from the underlying model
4. `createEventBus()` + `HarnessEvents` typed event catalog
5. `defineConfig()` + `envConfig()` Zod helpers
6. `retry.ts` — backoff + jitter + `Retry-After` + abort-wins
7. `cost.ts` — `PriceBook` + `trackCost(bus, prices)` + minimal `defaultPrices.ts`
8. `abort.ts` — utility (if any beyond native `AbortSignal`)
9. `testing/fakeProvider.ts` — scripted stream replay

**Exit criteria:**
- All public API members from spec §4 `@harness/core` exported from `packages/core/src/index.ts` (plus `/testing` subpath)
- 100% TDD per spec §8 testing conventions; `fakeProvider()` is the only fake — no mocks of `Provider`
- Package builds, typechecks, tests pass
- README documents each exported symbol with a minimal usage example

---

## Phase 2 — `@harness/agent`

**Delivers:** the runtime loop and composition primitives. This is the largest phase and **must** be split into sub-plans written and executed in order.

**Covers spec sections:** §4 `@harness/agent`, §5 full data flow, §6 reaction matrix (the parts enforced by the loop), guardrail hooks, HITL.

**Sub-plans to write (execute in order; each is its own per-phase plan):**

### 2a. Core loop + tool calling + memory
- `loop.ts` implementing steps 1–16 from spec §5, minus checkpointing/compaction/budgets/guardrails/handoff/graph
- `Tool<I,O>` interface + `tool()` factory + Zod arg validation + auto-repair
- `ConversationStore` interface + `inMemoryStore()`
- `AgentEvent` discriminated union
- `Agent.run()` drains `Agent.stream()`
- `AbortSignal` propagation top-down
- `maxTurns` + `LoopExhaustedError`

**Exit:** single-agent streaming chat works against `fakeProvider()` and a live provider via `HARNESS_LIVE=1`.

### 2b. Compaction + prompt caching
- `Compactor` interface + `summarizingCompactor()` default
- Auto-insert cache breakpoint after system+tools when provider supports caching
- `cacheBoundary: true` manual opt-in respected
- `compaction` and `provider.usage` (with cache tokens) events emitted

**Exit:** long histories get compacted; cache tokens show up in usage events against a caching-capable provider.

### 2c. Budgets + retry integration
- `budgets: { usd?, tokens? }` enforcement on `AgentConfig`
- Retry policy from `@harness/core/retry` wraps provider calls only
- `BudgetExceededError` + `budget.exceeded` event
- `provider.retry` event emission

**Exit:** over-budget agents abort cleanly; transient 5xx/429 retried with backoff.

### 2d. Checkpointer + HITL
- `Checkpointer` interface
- `requireApproval` on `Tool`; `tool-approval-required` event + `ApprovalResolver`
- Waiting-for-approval persistable via checkpointer
- `structured-partial` + `structured.repair` flow for `responseFormat`

**Exit:** a run can pause on HITL, persist via an in-memory checkpointer test double, and resume in a new process.

### 2e. Guardrails
- `InputHook` / `OutputHook` interfaces
- Sequential hook execution; first non-`pass` wins
- `guardrail-blocked` / `guardrail` events
- `GuardrailError` with phase

**Exit:** hook can block, rewrite, or pass on either phase.

### 2f. Composition — subagent-as-tool
- `subagentAsTool(child, spec)` returns a regular `Tool`
- Child gets fresh `conversationId`, same `signal`; events stream up namespaced; budget carved from parent

**Exit:** hierarchical agent scenario works end-to-end.

### 2g. Composition — handoff
- `handoff(target, carry)` special tool that ends current turn and resumes under target
- Shared state, budget carries over
- `handoff` event

**Exit:** peer-to-peer transfer scenario works.

### 2h. Composition — graph DSL
- `graph({ nodes, edges, checkpointer })` compiles a state machine into an `Agent`
- Conditional edges, checkpoint per transition, `interrupt()` support

**Exit:** spec's graph example runs with HITL interrupt resume.

**Overall Phase 2 exit criteria:**
- All public API members from spec §4 `@harness/agent` exported
- Reaction matrix (spec §6) covered by tests for every row
- Event catalog (spec §7) emissions verified
- TDD throughout with `fakeProvider()`; no live-provider dependency in unit tests

---

## Phase 3 — `@harness/tools`

**Delivers:** workspace-rooted `fsTool()` + allowlisted `fetchTool()`.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-3-tools.md`

**Covers spec sections:** §4 `@harness/tools`.

**Exit criteria:**
- `fsTool({ workspace, mode })` cannot escape workspace (path-traversal tests)
- `fetchTool({ allow, deny })` honors allow/deny lists; DNS rebinding / redirect escape considered
- Both tools pass through `AbortSignal`
- Both tools usable from a `createAgent()` call in a test

---

## Phase 4 — `@harness/memory-sqlite`

**Delivers:** SQLite-backed `ConversationStore` + `Checkpointer` (default durability story).

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-4-memory-sqlite.md`

**Covers spec sections:** §4 `@harness/memory-sqlite`, durability (spec §2 Durability row, §5 checkpointer interactions).

**Implementation hint:** `bun:sqlite` (zero-dep on Bun); consider `better-sqlite3` fallback only if Node 22 support on this package is required by `apps/http-server`.

**Exit criteria:**
- `sqliteStore()` round-trips messages for a conversation
- `sqliteCheckpointer()` can save, load, list; resume-after-HITL integration test passes
- Deleting the package leaves the repo building (clone-and-own check)

---

## Phase 5 — `@harness/observability`

**Delivers:** OTel + Langfuse event-bus adapters; `consoleSink` + `jsonlSink` (if not already in core).

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-5-observability.md`

**Covers spec sections:** §4 `@harness/observability`, §7 shipped sinks 2–5.

**Open question to resolve in the detailed plan:** do `consoleSink` / `jsonlSink` live in `core` (zero-dep, no Node-specifics needed for console) or here? Spec §7 lists them under "shipped sinks" without placing them. Recommend: `consoleSink` in `core` (Web-API safe), `jsonlSink` here (needs fs), OTel + Langfuse here.

**Exit criteria:**
- Both adapters return an unsubscribe function
- A demo agent run produces valid OTel spans and a Langfuse trace (behind `HARNESS_LIVE=1` for Langfuse)

---

## Phase 6 — `@harness/mcp`

**Delivers:** `mcpTools(client, opts)` — adapts any MCP server (stdio / http / websocket) into `@harness/agent` `Tool[]`.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-6-mcp.md`

**Covers spec sections:** §4 `@harness/mcp`.

**Exit criteria:**
- Round-trip against a trivial local MCP stdio server in tests
- `allow` / `deny` filters applied by tool name
- Per-tool Zod schemas derived from MCP tool schemas
- Deleting the package leaves the repo building

---

## Phase 7 — `@harness/eval`

**Delivers:** Evalite re-export + harness-specific scorers + Inspect-AI log writer + Langfuse trace export.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-7-eval.md`

**Covers spec sections:** §4 `@harness/eval`, §7 eval DSL.

**Exit criteria:**
- `evalite()` usage from spec §7 example runs under `bun test` (Evalite wraps Vitest — confirm runner interop early)
- `exactMatch`, `includes`, `llmJudge`, `toolCalled`, `finishedWithin` scorers each covered by a test
- `toInspectLog()` output validates against Inspect-AI log schema (spot-check with a sample)
- `toLangfuse()` pushes a single trace end-to-end (gated by `HARNESS_LIVE=1`)
- Deleting the package leaves the repo building

---

## Phase 8 — `@harness/cli`

**Delivers:** `harness-eval` command with model matrix, HTML report, export adapters.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-8-cli.md`

**Covers spec sections:** §4 `@harness/cli`, §7 eval CLI.

**Exit criteria:**
- `harness-eval "packages/**/*.eval.ts"` discovers evals
- `--models` matrix fans out per model
- `--concurrency N` honored
- HTML report + `results.jsonl` written under `.harness/reports/<timestamp>/`
- `--export inspect,langfuse` triggers the respective adapters

---

## Phase 9 — `apps/cli-chat`

**Delivers:** terminal streaming chat demo; OpenRouter by default.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-9-cli-chat.md`

**Covers spec sections:** §8 first-run target, §10 success criterion #1 + #2.

**Testing policy:** pragmatic / tests-after (spec §8).

**Exit criteria:**
- `bun run chat` from a fresh clone → first response in <3 min (success criterion §10.1)
- Switching OpenRouter → Ollama is a one-line change (success criterion §10.2)
- `.env.example` documents required keys

---

## Phase 10 — `apps/http-server`

**Delivers:** Hono server; stateless `(conversationId, input) → SSE stream` with AI-SDK `UIMessage` format.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-10-http-server.md`

**Covers spec sections:** §8 examples, §9 non-goal "No stateful HTTP sessions".

**Exit criteria:**
- Single POST endpoint streams AgentEvents as SSE
- No session state held in process — all persistence goes through a configured `ConversationStore`
- curl-based smoke test in the README works
- Deleting the app leaves the repo building

---

## Phase 11 — Documentation

**Delivers:** full `/docs` tree per spec §8.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-11-docs.md`

**Covers:**
- `docs/getting-started.md` (clone to first chat)
- `docs/architecture.md` (trimmed spec)
- `docs/extending/*.md` (one per extension point: provider, tool, store, compactor, checkpointer, sink)
- `docs/patterns/*.md` (hierarchical, handoff, graph, hitl, long-running)
- `docs/adr/*.md` — one ADR per load-bearing decision from spec §2
- `docs/upgrading.md` — cherry-pick flow

**Exit criteria:**
- Every extension point in spec §8 has an `extending/` doc
- Every pattern in spec §8 has a `patterns/` doc
- Each load-bearing decision from spec §2 has an ADR

---

## Phase 12 — Clone-and-own verification

**Delivers:** the "tested success criterion" from spec §3.

**Detailed plan to write:** `docs/superpowers/plans/<date>-phase-12-verification.md`

**Covers spec sections:** §10 success criteria (all), §3 clone-and-own affordances.

**Tasks (sketch):**
- Script or CI job that, on a fresh clone, deletes one of `packages/eval`, `packages/mcp`, `packages/memory-sqlite`, `apps/http-server` (matrix) and runs `bun run ci`
- Measure `bun run ci` wall clock on a laptop (target <30s per success criterion)
- End-to-end HITL persist-and-resume test across processes
- First-run timing harness (clone → first response) — can be a manual runbook

**Exit criteria:**
- All six bullets of spec §10 verified
- Clone-and-own matrix green in CI

---

## Self-review against spec

Coverage check (spec section → phase):

| Spec section | Covered in phase(s) |
|---|---|
| §1 Purpose | — (narrative; no implementation) |
| §2 Design decisions | 0 (tooling rows), all subsequent phases (feature rows) |
| §3 Repo layout + dep direction | 0 (layout + Biome import rule); 12 (clone-and-own) |
| §3 Runtime boundary | 1 (enforce `core` is Web-API only) |
| §4 Public API surfaces | 1–8 (one phase per package) |
| §5 Data flow — agent loop | 2a–2h |
| §6 Error taxonomy + retry | 1 (types + retry util); 2c (budget); 2a/2b/2d (loop reactions) |
| §6 Guardrails | 2e |
| §7 Event catalog | 1 (types); 2a–2h (emissions); 5 (sinks) |
| §7 Cost tracking | 1 |
| §7 Eval DSL + CLI | 7, 8 |
| §8 Developer experience | 0 (tooling); 9, 10 (first-run); 11 (docs) |
| §9 Non-goals | — (nothing to implement; each phase plan should restate relevant non-goals so they aren't accidentally built) |
| §10 Success criteria | 12 |

No gaps identified. Non-goals from §9 are not implemented by design; each per-phase plan should call out the relevant ones in a "won't-do" section to prevent drift.

---

## Execution handoff

**Do not pick an execution mode yet.** This roadmap is not directly executable — it is the index of per-phase plans you'll write one at a time.

**Recommended workflow for each phase:**
1. Invoke `superpowers:writing-plans` with the spec + the relevant section of this roadmap as arguments → produces the detailed per-phase plan.
2. Invoke `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` on that plan.
3. After phase exit criteria pass, tick the phase off in this file (add a ✅ next to the phase header) and move to the next.
