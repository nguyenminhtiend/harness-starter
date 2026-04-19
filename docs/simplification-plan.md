# Code Simplification Plan

> Generated 2026-04-19 — full-project audit of `harness-starter`.
> Goal: reduce complexity, improve clarity and maintainability — **zero behavior changes**.

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | High impact, low risk — do first |
| **P1** | Medium impact, clear win |
| **P2** | Low impact, polish / consistency |

---

## 1. Dead & Dormant Code (P0)

### 1.1 Remove deprecated `createResearchAgent`

- **File:** `apps/deep-research/src/agents/researcher.ts` (lines 35–48)
- **Issue:** Marked `@deprecated`, not imported anywhere in the repo.
- **Action:** Delete the function. If historical reference is needed, git history suffices.

### 1.2 Wire or remove `citationCheckHook`

- **File:** `apps/deep-research/src/guardrails/citation-check.ts`
- **Issue:** Exported and tested but never wired into the graph, writer, or CLI. Dead surface area.
- **Action:** Either integrate into the writer/graph pipeline (collect URLs from findings → hook) or delete the module and its test. If kept as "library code," document that explicitly in a comment.

### 1.3 Remove unused `@harness/observability` dep in cli-chat

- **File:** `apps/cli-chat/package.json`
- **Issue:** Listed as a dependency but never imported in `apps/cli-chat/src/`.
- **Action:** Remove from `dependencies`.

### 1.4 Audit `OTEL_EXPORTER_OTLP_ENDPOINT` in deep-research config

- **File:** `apps/deep-research/src/config.ts` (line 15)
- **Issue:** Declared in the Zod schema but not read anywhere under `apps/deep-research/src/`.
- **Action:** Verify if consumed via `@harness/core` env passthrough. If not, remove from this app's schema.

---

## 2. Long Functions — Split by Responsibility (P0)

### 2.1 Split `createResearchGraph` (~130 lines)

- **File:** `apps/deep-research/src/graph.ts` (lines 26–156)
- **Issue:** Single function defining all graph nodes, edges, and orchestration logic.
- **Action:** Extract node factories:
  - `createPlanNode(provider, opts)` → returns `GraphNode`
  - `createApproveNode(opts)` → returns `GraphNode`
  - `createResearchNode(provider, tools, opts)` → returns `GraphNode`
  - `createWriteNode(provider, opts)` → returns `GraphNode`
  - `createFactCheckNode(provider, opts)` → returns `GraphNode`
  - Keep `createResearchGraph` as the thin composer wiring edges between them.

### 2.2 Split `index.ts` orchestration (~90-line try block)

- **File:** `apps/deep-research/src/index.ts` (lines 165–252)
- **Issue:** CLI entry mixes arg parsing, sink setup, graph execution, HITL resume, report writing, and teardown in one block.
- **Action:** Extract:
  - `setupObservability(config)` → returns sinks array + teardown fn
  - `runResearchLoop(graph, opts)` → handles HITL approval loop
  - `persistReport(report, outDir, runId)` → mkdir + write + log
  - `shutdown(sinks, persistence)` → centralized teardown (eliminates duplicated finally paths)

### 2.3 Split `dispatch` in stream-renderer (~60 lines)

- **File:** `packages/agent/src/stream-renderer.ts` (lines 78–137)
- **Issue:** Large `switch` on event types.
- **Action:** Extract handlers by domain or use a `Map<EventType, Handler>`. Collapse no-op cases into one `case` group.

### 2.4 Split `formatEvent` in console-sink (~60 lines)

- **File:** `packages/observability/src/console-sink.ts` (lines 53–114)
- **Issue:** Large `switch` with repeated `as Record<string, unknown>` casts.
- **Action:** Formatter map: `const formatters: Record<string, (p: unknown) => string>`. Each event gets a small named function.

### 2.5 Extract `handleUserInput` in cli-chat

- **File:** `apps/cli-chat/src/index.ts` (lines 43–93)
- **Issue:** ~51-line callback inside `rl.question`.
- **Action:** Extract `async function handleUserInput(line: string, agent, conversationId, spinner): Promise<void>` so `prompt()` stays thin.

---

## 3. Deep Nesting → Guard Clauses (P0)

### 3.1 Flatten HITL approval loop

- **File:** `apps/deep-research/src/index.ts` (lines 172–209)
- **Issue:** Four nesting levels: `if (!summary)` → `if (plan)` → `if (answer !== 'y')` → `if (checkpoint?.graphState)`.
- **Action:** Invert conditions to early-`continue`/early-`return` at each level. Optionally extract `async function resumeAfterApproval(...)`.

### 3.2 Flatten spinner `start()` nesting

- **File:** `packages/tui/src/spinner.ts` (lines 17–24)
- **Issue:** `setTimeout` → `setInterval` → body (three nested closures).
- **Action:** Extract `const tick = () => { ... }` and `function armSpinnerAfterDelay(...)` so `start()` reads as two named steps.

---

## 4. Duplicated Logic — Extract Shared Helpers (P1)

### 4.1 Unify agent opts types

- **Files:** `researcher.ts`, `writer.ts`, `fact-checker.ts` (all under `apps/deep-research/src/agents/`)
- **Issue:** `ResearcherOpts`, `WriterOpts`, `FactCheckerOpts` duplicate the same optional fields (`budgets`, `events`, `memory`). Same `...(opts?.budgets ? …) : {}` spread pattern in each.
- **Action:** Define `BaseAgentOpts` in `apps/deep-research/src/agents/types.ts` importing `BudgetLimits` from `budgets.ts`. Each agent opts extends it.

### 4.2 Centralize JSON-from-model parsing

- **Files:** `graph.ts` (lines 72–76, 122–127), `planner.ts` (`extractJson`), fact-check node (raw `JSON.parse`)
- **Issue:** Three different "strip markdown fence + parse + fallback" patterns.
- **Action:** Single `parseModelJson<T>(raw: string, schema: ZodType<T>): T` utility in `apps/deep-research/src/lib/parse-json.ts`. All nodes use it.

### 4.3 Deduplicate teardown paths

- **File:** `apps/deep-research/src/index.ts` (lines 232–234 vs 238–240)
- **Issue:** Success and error branches both loop sinks + close persistence.
- **Action:** Single `async function shutdown(sinks, persistence)` called from `finally`.

### 4.4 Deduplicate `checkpointer.load` calls

- **File:** `apps/deep-research/src/index.ts` (line 173 vs 197)
- **Issue:** Same checkpoint loaded twice.
- **Action:** Load once after approval decision, reuse the result.

### 4.5 Deduplicate `mkdir` calls

- **Files:** `index.ts` (lines 117, 220) and `report/write.ts` (line 25)
- **Issue:** `outDir` created in multiple places.
- **Action:** Single responsibility: only `writeReport` creates the directory, or only the CLI. Pick one.

### 4.6 Extract `errorMessage(error: unknown): string`

- **File:** `packages/observability/src/console-sink.ts` (lines 68–70, 85–87)
- **Issue:** Same "pull `.message` from unknown error" pattern twice.
- **Action:** Small helper `function errorMessage(err: unknown): string`.

### 4.7 Extract `addUsage` helper

- **File:** `packages/agent/src/stream-renderer.ts` (lines 52–57)
- **Issue:** `(usage.x ?? 0) + (u.x ?? 0)` repeated three times.
- **Action:** `function addUsage(a: Usage, b: Usage): Usage` in same file.

### 4.8 Deduplicate in-memory persistence return shape

- **File:** `apps/deep-research/src/persistence.ts` (lines 19–25 vs 47–52)
- **Issue:** Identical in-memory `{ store, checkpointer, type: 'memory', close }` object in two places.
- **Action:** Extract `function inMemoryPersistence(): PersistenceResult`.

### 4.9 Extract `messageTextContent` helper

- **File:** `apps/deep-research/src/agents/planner.ts` (lines 48–54)
- **Issue:** String vs multimodal content extraction logic; similar extraction needed elsewhere.
- **Action:** `function messageTextContent(content: string | ContentPart[]): string` shared across agents.

---

## 5. Naming & Readability (P1)

### 5.1 Rename `gs` → `graphState` or `savedState`

- **File:** `apps/deep-research/src/index.ts` (line 174)

### 5.2 Rename `streamAc` → `streamAbortController`

- **File:** `apps/cli-chat/src/index.ts` (lines 26, 35, 51, 71, 89)

### 5.3 Rename `def` → `defaultChoice`

- **File:** `packages/tui/src/approval.ts` (lines 10, 18)

### 5.4 Rename `cb` → `callbacks` in stream-renderer dispatch

- **File:** `packages/agent/src/stream-renderer.ts` (line 79)

---

## 6. Verbose / Fragile Patterns (P1)

### 6.1 Remove repeated type casts for checkpoint state

- **File:** `apps/deep-research/src/index.ts` (lines 174–175, 199)
- **Issue:** Repeated `as { data: Record<string, unknown> }` / `as ResearchPlan`.
- **Action:** Extract `function readPlanFromCheckpoint(saved): ResearchPlan | undefined` with one typed narrowing path.

### 6.2 Replace fragile string matching in handoff renderer

- **File:** `apps/deep-research/src/ui/render.ts` (lines 51–54)
- **Issue:** `to.includes('writer') || to.includes('write')` breaks if node names change.
- **Action:** Use constants for node names or structured handoff metadata.

### 6.3 Normalize error in cli-chat

- **File:** `apps/cli-chat/src/index.ts` (lines 81–84)
- **Issue:** `(err as Error)` cast twice.
- **Action:** `const error = err instanceof Error ? err : new Error(String(err))`.

### 6.4 Redundant phase guard

- **File:** `apps/deep-research/src/ui/render.ts` (lines 88–92)
- **Issue:** `if (phase !== 'done') { phase = 'done'; }` → just `phase = 'done'`.

---

## 7. Typing Improvements (P2)

### 7.1 Improve `ApprovalDecision` discriminant

- **File:** `packages/agent/src/types.ts` (lines 119–122)
- **Issue:** Two of three union members use `approve: true`, making narrowing ambiguous.
- **Action:** Add `type: 'approve' | 'reject' | 'approve-with-args'` discriminant.

### 7.2 Remove redundant `| undefined` on optional fields

- **File:** `packages/agent/src/types.ts` (line 33), `apps/deep-research/src/agents/researcher.ts` (lines 51–53)
- **Issue:** `bus?: EventBus | undefined` — `?` already implies `undefined`.

### 7.3 Add exhaustiveness check to stream-renderer switch

- **File:** `packages/agent/src/stream-renderer.ts` (lines 85–136)
- **Action:** Add `default: { const _exhaustive: never = event; }` to catch new event types at compile time.

---

## 8. Test Simplification (P1)

### 8.1 Extract shared test fixtures

- **Files:** `graph.test.ts`, `integration.test.ts`, agent test files
- **Issue:** `planResponse`, `textScript`, `samplePlan`, `sampleFinding`, `sampleReport`, `collectEvents` duplicated almost verbatim.
- **Action:** Create `apps/deep-research/src/test-utils.ts` with shared stream builders, sample payloads, and `collectEvents`.

### 8.2 Fix mismatched defaults in cli-chat config test

- **Files:** `apps/cli-chat/src/config.test.ts` (line 7) vs `apps/cli-chat/src/config.ts` (line 6)
- **Issue:** Test schema uses `'anthropic/claude-sonnet-4'` as `MODEL_ID` default; production uses `'openrouter/free'`. Tests give false confidence.
- **Action:** Import and reuse the production schema in tests, or export the schema and test against the real defaults.

### 8.3 Mock network in search tests

- **File:** `apps/deep-research/src/tools/search.test.ts`
- **Issue:** Tests hit `httpbin.org` — flaky if service is down or rate-limited.
- **Action:** Mock `globalThis.fetch` for URL validation tests; keep one tagged integration test for live checks.

### 8.4 Parameterize stream-renderer callback tests

- **File:** `packages/agent/src/stream-renderer.test.ts` (lines 76–171)
- **Issue:** ~100 lines of near-identical callback test structure.
- **Action:** Table-driven `test.each` with `{ event, setup, expectedCall }[]`.

### 8.5 Deduplicate `ctx` objects across tests

- **Files:** `researcher.test.ts`, `planner.test.ts`, `search.test.ts`, `citation-check.test.ts`
- **Issue:** Nearly identical `{ runId, conversationId, signal }` objects.
- **Action:** Shared `makeTestCtx()` helper in `test-utils.ts`.

### 8.6 Strengthen weak assertions

| File | Issue | Fix |
|------|-------|-----|
| `graph.test.ts` | `checkpointEvents.length >= 1` — weak | Assert specific checkpoint content or ordering |
| `stream-renderer.test.ts` | `durationMs >= 0` — doesn't prove timing | Use fake timers or bounded delta |
| `researcher.test.ts` | Substring `toContain` on JSON result | `JSON.parse(result)` + `toMatchObject(sampleFinding)` |
| `fact-checker.test.ts` | `"can be used as a handoff target"` only checks `turns >= 1` | Assert provider call or conversationId propagation |
| `report/slug.test.ts` | Truncation only checks `length <= 60` | Golden string assertion |

### 8.7 Test planner via public API, not `node.fn`

- **File:** `apps/deep-research/src/agents/planner.test.ts`
- **Issue:** Tests cast and call internal `node.fn` directly.
- **Action:** Export a thin `runPlanner` wrapper or test through the graph entry point.

### 8.8 Add missing `SIGTERM` assertion

- **File:** `packages/tui/src/sigint.test.ts` (lines 68–84)
- **Issue:** SIGTERM test asserts `onExit` was called but doesn't assert `onAbort` was **not** called.
- **Action:** Add `expect(aborted).toBe(false)`.

---

## 9. Barrel / Structure Consistency (P2)

### 9.1 Align barrel file style

- **Files:** `packages/tui/src/index.ts` (minimal), `packages/agent/src/index.ts` (section comments)
- **Issue:** Different barrel styles across packages.
- **Action:** Pick one style (prefer minimal re-exports) and align. Fix misleading empty "Types" section header in agent barrel.

### 9.2 Align `it` vs `test` in test files

- **Issue:** `apps/deep-research` tests use `it`; `packages/agent` and `packages/observability` tests use `test`.
- **Action:** Pick one convention per workspace (or repo-wide) and align.

### 9.3 Align assertion helpers

- **Issue:** `toBeFunction()` (Bun matcher) vs `typeof === 'function'` used inconsistently.
- **Action:** Standardize on `toBeFunction()`.

---

## 10. Execution Plan

### Phase 1 — Dead code & high-impact splits (P0)

1. Remove `createResearchAgent` → run tests
2. Wire or remove `citationCheckHook` → run tests
3. Remove unused deps (`@harness/observability` in cli-chat, `OTEL_EXPORTER_OTLP_ENDPOINT` if dead)
4. Split `createResearchGraph` into node factories → run tests
5. Split `index.ts` orchestration into named functions → run tests
6. Flatten HITL approval nesting → run tests

**Verify:** `bun run ci` passes, diff is clean.

### Phase 2 — Deduplication & helpers (P1)

7. Create `BaseAgentOpts` + `BudgetLimits` reuse
8. Create `parseModelJson` utility
9. Extract `shutdown`, `inMemoryPersistence`, `errorMessage`, `addUsage`, `messageTextContent` helpers
10. Deduplicate `checkpointer.load` and `mkdir` calls
11. Fix naming: `gs`, `streamAc`, `def`, `cb`
12. Fix type casts, fragile string matching, redundant patterns

**Verify:** `bun run ci` passes, diff is clean.

### Phase 3 — Test cleanup (P1)

13. Extract shared test fixtures → `test-utils.ts`
14. Fix cli-chat config test schema mismatch
15. Mock network in search tests
16. Parameterize stream-renderer callback tests
17. Strengthen weak assertions
18. Add missing SIGTERM negative assertion

**Verify:** `bun test` passes, no flaky failures.

### Phase 4 — Polish (P2)

19. Improve `ApprovalDecision` discriminant
20. Remove redundant `| undefined` on optional fields
21. Add exhaustiveness check in stream-renderer
22. Align barrel styles, `it`/`test`, assertion helpers

**Verify:** `bun run ci` passes.

---

## Estimated Scope

| Phase | Files touched | Estimated LOC changed |
|-------|---------------|----------------------|
| 1 | ~6 | ~200 |
| 2 | ~12 | ~150 |
| 3 | ~10 | ~200 |
| 4 | ~8 | ~50 |
| **Total** | **~30** | **~600** |

Each phase should be a separate PR. Each simplification within a phase should be a separate commit with tests passing after each.
