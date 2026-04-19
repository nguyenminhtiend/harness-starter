# Implementation Plan: `apps/deep-research` — Remaining Work

## Overview

The deep-research CLI has its scaffold, schemas, planner, basic researcher, basic graph (plan → approve → research), report writer, slug, CLI entrypoint, and unit tests for those. What's missing is the full multi-agent architecture (subagentAsTool researchers, handoff writer/fact-checker), the complete graph topology with retry loop, search/MCP tools, guardrails, sqlite persistence, budget enforcement, observability sinks, evals, rich UI rendering, and documentation.

## Current State (Done)

| Component | Status | Notes |
|---|---|---|
| `package.json` + `tsconfig.json` | ✅ | All harness deps declared (mcp/memory-sqlite as optional) |
| `src/config.ts` | ✅ | `envConfig()` with Zod schema |
| `src/provider.ts` | ✅ | `aiSdkProvider` + OpenRouter |
| `src/schemas/plan.ts` | ✅ | `ResearchPlan`, `Subquestion` + tests |
| `src/schemas/report.ts` | ✅ | `Finding`, `Report`, `ReportSection`, `Reference` + tests |
| `src/agents/planner.ts` | ✅ | GraphNode with `provider.generate` + Zod parse + tests |
| `src/agents/researcher.ts` | ✅ | Basic `createAgent` with `fetchTool` (no subagentAsTool) |
| `src/graph.ts` | ✅ | 3-node graph: plan → approve → research + tests |
| `src/report/slug.ts` | ✅ | `slugify()` + tests |
| `src/report/write.ts` | ✅ | `renderMarkdown` + atomic `writeReport` + tests |
| `src/index.ts` | ✅ | CLI entrypoint, arg parsing, HITL flow, spinner, SIGINT |
| `.gitignore` | ✅ | `reports/` ignored |

## Architecture Decisions

- **Vertical slicing** — each task delivers a testable increment that leaves the app buildable
- **Respect the DAG** — harness packages are consumed, never modified; optional deps (mcp, memory-sqlite) stay optional
- **subagentAsTool for researchers** — matches spec D2; each researcher gets isolated context
- **handoff for writer + fact-checker** — matches spec D3; they share state
- **sqlite default, inMemory behind --ephemeral** — matches spec D4

## Dependency Graph (tasks only)

```
T1 (search tools)
    │
    └─► T2 (researcher → subagentAsTool)
            │
            ├─► T3 (writer handoff)
            │       │
            │       └─► T4 (fact-checker + guardrail)
            │               │
            │               └─► T5 (full graph)
            │
            └─► T5 (full graph)

T6 (sqlite persistence) ─────────► T5 (full graph needs checkpointer)

T7 (budget enforcement) ─────────► T5 (full graph distributes budgets)

T5 (full graph)
    │
    ├─► T8 (observability sinks)
    ├─► T9 (rich UI rendering)
    ├─► T10 (integration test)
    └─► T12 (README)

T10 (integration test) ◄───────── T4 (needs full chain)

T11 (evals) ◄──────────────────── T5 (needs working app)
```

---

## Task List

### Phase 1: Search Tools + Researcher Subagent

- [ ] Task 1: Create search tool module
- [ ] Task 2: Convert researcher to `subagentAsTool`

### Checkpoint: Phase 1
- [ ] `bun test apps/deep-research` passes
- [ ] `bun run typecheck` passes in `apps/deep-research`
- [ ] Researcher subagent can be invoked as a tool by the planner

### Phase 2: Writer, Fact-Checker, Full Graph

- [ ] Task 3: Create writer agent (handoff target)
- [ ] Task 4: Create fact-checker agent + citation-check guardrail
- [ ] Task 5: Wire full graph (plan → approve → research → write → fact-check → finalize)

### Checkpoint: Phase 2
- [ ] `bun test apps/deep-research` passes
- [ ] `bun run typecheck` passes
- [ ] Full graph topology matches spec §5
- [ ] Fact-checker retry loop caps at 2 retries
- [ ] Review with human before proceeding

### Phase 3: Persistence + Budget

- [ ] Task 6: Wire sqlite persistence with `--ephemeral` fallback
- [ ] Task 7: Budget enforcement with per-agent carve-up

### Checkpoint: Phase 3
- [ ] `bun test apps/deep-research` passes
- [ ] `--ephemeral` uses inMemoryStore/inMemoryCheckpointer
- [ ] Default run uses sqliteStore/sqliteCheckpointer
- [ ] `--budget-usd 0.01` exits code 1 with readable message

### Phase 4: Observability + UI

- [ ] Task 8: Wire observability sinks
- [ ] Task 9: Create rich phase-based UI renderer

### Checkpoint: Phase 4
- [ ] `bun test apps/deep-research` passes
- [ ] JSONL event log written alongside report files
- [ ] Console output shows phase-based progress (planning, researching, writing, verifying)

### Phase 5: Tests + Evals + Polish

- [ ] Task 10: Integration test (end-to-end with fakeProvider)
- [ ] Task 11: Create eval suite
- [ ] Task 12: Write README

### Checkpoint: Complete
- [ ] All acceptance criteria from spec §11 met
- [ ] `bun run ci` is green
- [ ] Ready for review

---

## Task Details

### Task 1: Create search tool module

**Description:** Create `src/tools/search.ts` wrapping `fetchTool` with a domain allowlist, and `src/tools/mcp.ts` for optional Brave Search MCP integration. The MCP path is guarded by config (`BRAVE_API_KEY` presence) so the app builds without `@harness/mcp` installed.

**Acceptance criteria:**
- [ ] `src/tools/search.ts` exports a `createSearchTools()` function returning `Tool[]`
- [ ] When `BRAVE_API_KEY` is set and `@harness/mcp` is available, MCP tools are included
- [ ] When MCP is unavailable, falls back to `fetchTool`-only (no crash)
- [ ] `fetchTool` uses a sensible allowlist (not `/.*/`)

**Verification:**
- [ ] `bun run typecheck` passes in `apps/deep-research`
- [ ] `bun test apps/deep-research/src/tools` passes (unit test for fallback logic)

**Dependencies:** None

**Files likely touched:**
- `src/tools/search.ts` (new)
- `src/tools/mcp.ts` (new)
- `src/tools/search.test.ts` (new)

**Estimated scope:** Small (2-3 files)

---

### Task 2: Convert researcher to `subagentAsTool`

**Description:** Refactor `src/agents/researcher.ts` so each researcher is wrapped via `subagentAsTool`. The planner should be able to invoke N researchers in parallel (one per subquestion). Each subagent gets isolated conversation context.

**Acceptance criteria:**
- [ ] `createResearcherTool()` returns a `Tool` created via `subagentAsTool()`
- [ ] Researcher uses `createSearchTools()` from Task 1 instead of raw `fetchTool`
- [ ] Researcher subagent prompt focuses on a single subquestion (not the full report)
- [ ] Results are aggregated as `Finding[]` in graph state

**Verification:**
- [ ] `bun test apps/deep-research/src/agents/researcher.test.ts` passes
- [ ] `bun run typecheck` passes

**Dependencies:** Task 1

**Files likely touched:**
- `src/agents/researcher.ts` (modify)
- `src/agents/researcher.test.ts` (new)

**Estimated scope:** Small (2 files)

---

### Task 3: Create writer agent (handoff target)

**Description:** Create `src/agents/writer.ts` — a `handoff` target agent that receives all findings from the research phase and drafts a structured Report (Zod-validated). The writer sees the full conversation context (handoff shares state).

**Acceptance criteria:**
- [ ] `createWriterAgent()` returns an agent suitable for `handoff()`
- [ ] Writer prompt instructs it to produce a structured report from findings
- [ ] Output is validated against the `Report` schema
- [ ] Writer uses `summarizingCompactor()` (it sees all findings, needs compaction)

**Verification:**
- [ ] `bun test apps/deep-research/src/agents/writer.test.ts` passes
- [ ] `bun run typecheck` passes

**Dependencies:** None (schemas already exist)

**Files likely touched:**
- `src/agents/writer.ts` (new)
- `src/agents/writer.test.ts` (new)

**Estimated scope:** Small (2 files)

---

### Task 4: Create fact-checker agent + citation-check guardrail

**Description:** Create `src/agents/fact-checker.ts` as a `handoff` target that verifies each citation in the report. Create `src/guardrails/citation-check.ts` as an output hook that flags citations whose URLs never appeared in fetch results. The fact-checker can trigger up to 2 retries back to the writer.

**Acceptance criteria:**
- [ ] `createFactCheckerAgent()` returns an agent suitable for `handoff()`
- [ ] Fact-checker reviews citations and returns pass/fail with details
- [ ] `citationCheckHook` is an output hook that cross-references cited URLs against fetched URLs
- [ ] Retry logic caps at 2 attempts (after 2 failures, emit warning and proceed)

**Verification:**
- [ ] `bun test apps/deep-research/src/agents/fact-checker.test.ts` passes
- [ ] `bun test apps/deep-research/src/guardrails/citation-check.test.ts` passes
- [ ] `bun run typecheck` passes

**Dependencies:** Task 3 (fact-checker retries to writer)

**Files likely touched:**
- `src/agents/fact-checker.ts` (new)
- `src/agents/fact-checker.test.ts` (new)
- `src/guardrails/citation-check.ts` (new)
- `src/guardrails/citation-check.test.ts` (new)

**Estimated scope:** Medium (4 files)

---

### Task 5: Wire full graph (plan → approve → research → write → fact-check → finalize)

**Description:** Rebuild `src/graph.ts` to match the spec §5 topology. Add writer and fact-checker as handoff nodes. Add a finalize node that writes the report. Add conditional edge from fact-checker back to writer (up to 2 retries). Update `src/index.ts` to pass new options and handle the full flow.

**Acceptance criteria:**
- [ ] Graph has 6 nodes: plan, approve, research, write, fact-check, finalize
- [ ] Fact-check → writer retry edge is conditional (max 2 retries, tracked in state)
- [ ] Finalize node writes the report file and emits `report.completed`
- [ ] `src/index.ts` updated: simplified (graph handles more), exit code 3 on fact-check failure
- [ ] All existing graph tests updated and pass
- [ ] New tests for fact-check retry loop and finalize

**Verification:**
- [ ] `bun test apps/deep-research/src/graph.test.ts` passes
- [ ] `bun run typecheck` passes
- [ ] Manual: `bun run src/index.ts --no-approval "test"` with fakeProvider traces through all nodes

**Dependencies:** Tasks 2, 3, 4

**Files likely touched:**
- `src/graph.ts` (rewrite)
- `src/graph.test.ts` (rewrite)
- `src/index.ts` (update)

**Estimated scope:** Medium (3 files)

---

### Task 6: Wire sqlite persistence with `--ephemeral` fallback

**Description:** Default to `sqliteStore` + `sqliteCheckpointer` from `@harness/memory-sqlite`. Fall back to in-memory when `--ephemeral` is passed or when `@harness/memory-sqlite` is not installed. Wire `--resume <runId>` to load from sqlite checkpointer.

**Acceptance criteria:**
- [ ] Default run uses `sqliteStore()` and `sqliteCheckpointer()` (data in `~/.deep-research/` or configurable)
- [ ] `--ephemeral` flag switches to `inMemoryStore()` + `inMemoryCheckpointer()`
- [ ] `--resume <runId>` loads checkpoint and continues the graph from where it stopped
- [ ] If `@harness/memory-sqlite` import fails, graceful fallback to in-memory with a warning
- [ ] Researcher agent's memory uses the store (so findings persist across resumes)

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] `bun test apps/deep-research` passes (existing tests still use inMemory)
- [ ] Manual: run → Ctrl+C → `--resume` picks up from checkpoint

**Dependencies:** Task 5 (needs full graph to test resume across all nodes)

**Files likely touched:**
- `src/index.ts` (update persistence wiring)
- `src/graph.ts` (accept store param)

**Estimated scope:** Small (2 files)

---

### Task 7: Budget enforcement with per-agent carve-up

**Description:** Implement the budget split from D13: planner 10%, researchers 60% (split equally), writer 20%, fact-checker 10%. Use `createBudgetTracker` from `@harness/agent`. Each sub-agent aborts on its own budget exhaustion. App exits code 1 when overall budget is exceeded.

**Acceptance criteria:**
- [ ] `--budget-usd` and `--budget-tokens` flags wire into per-agent budget limits
- [ ] Budget split matches D13 (10/60/20/10)
- [ ] `budget.exceeded` event is emitted when a limit is hit
- [ ] App exits with code 1 and a readable message on budget exhaustion
- [ ] Individual agent budget exhaustion doesn't crash the whole app (parent continues with gathered data)

**Verification:**
- [ ] `bun test apps/deep-research` passes
- [ ] `bun run typecheck` passes
- [ ] Unit test: budget tracker enforces per-role limits

**Dependencies:** Task 5 (needs full graph with all agent roles)

**Files likely touched:**
- `src/graph.ts` (budget params per node)
- `src/index.ts` (budget flag wiring, exit code 1)
- `src/budgets.ts` (new — budget split logic)
- `src/budgets.test.ts` (new)

**Estimated scope:** Medium (4 files)

---

### Task 8: Wire observability sinks

**Description:** Wire `consoleSink` (always), `jsonlSink` (always — writes `.events.jsonl` alongside report), and optional `langfuseAdapter` + `otelAdapter` (env-gated). Events flow from the graph's event bus through the sinks.

**Acceptance criteria:**
- [ ] `consoleSink` active by default (already partially done via stream renderer)
- [ ] `jsonlSink` writes `<slug>-<ts>.events.jsonl` in the same directory as the report
- [ ] `LANGFUSE_PUBLIC_KEY` env triggers `langfuseAdapter` attachment
- [ ] `LANGFUSE_PUBLIC_KEY` / OTel env vars documented in config schema
- [ ] Langfuse trace shows: root trace, child spans for each agent role, tool calls on researchers

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] `bun test apps/deep-research` passes
- [ ] Manual: run produces `.events.jsonl` alongside `.md`

**Dependencies:** Task 5 (needs event bus from full graph)

**Files likely touched:**
- `src/index.ts` (sink wiring)
- `src/config.ts` (add LANGFUSE_*, OTEL_* to schema as optional)

**Estimated scope:** Small (2 files)

---

### Task 9: Create rich phase-based UI renderer

**Description:** Create `src/ui/render.ts` with app-specific rendering callbacks for `createStreamRenderer`. Show phase-based progress matching the spec §9 rendering contract: planning, researching (with per-subquestion progress), writing, fact-checking, with spinner per phase and status indicators.

**Acceptance criteria:**
- [ ] `createDeepResearchRenderer()` returns callbacks for `createStreamRenderer`
- [ ] Planning phase: `📋 planning…` with spinner
- [ ] Research phase: shows N parallel subquestions with per-question status
- [ ] Writing phase: `✍️ writing…` with spinner
- [ ] Fact-check phase: `🔍 fact-checking…` with warning on retry
- [ ] Finalize: `✅ report saved → <path>` with usage footer
- [ ] Handoff events are rendered (shows transitions between agents)

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: run against live model shows correct phase rendering

**Dependencies:** Task 5 (needs full graph events to render)

**Files likely touched:**
- `src/ui/render.ts` (new)
- `src/index.ts` (swap inline renderer callbacks for `createDeepResearchRenderer`)

**Estimated scope:** Small (2 files)

---

### Task 10: Integration test (end-to-end with fakeProvider)

**Description:** Create `tests/integration.test.ts` — an end-to-end test that scripts the full flow (plan → research → write → fact-check → finalize) using `fakeProvider`. Asserts: file written, events emitted, exit 0. No network calls.

**Acceptance criteria:**
- [ ] Test scripts fakeProvider responses for each graph node
- [ ] Asserts report file is written to a temp directory
- [ ] Asserts key events emitted (plan created, research complete, report.completed)
- [ ] Asserts correct exit (no throws) on happy path
- [ ] Tests fact-check retry path (fail → retry → pass)

**Verification:**
- [ ] `bun test apps/deep-research/tests/integration.test.ts` passes
- [ ] No network calls during test

**Dependencies:** Task 5

**Files likely touched:**
- `tests/integration.test.ts` (new)

**Estimated scope:** Medium (1 file, but complex scripting)

---

### Task 11: Create eval suite

**Description:** Create `evals/factuality.eval.ts` (llmJudge scorer) and `evals/citation.eval.ts` (exact-match/includes on fetched URLs). Create `evals/fixtures/questions.jsonl` with known questions + expected citation domains. Gated behind `HARNESS_LIVE=1`. Runnable via `bun run eval`.

**Acceptance criteria:**
- [ ] `evals/factuality.eval.ts` uses `createScorer` with `llmJudge`
- [ ] `evals/citation.eval.ts` uses exact-match/includes on URLs
- [ ] `evals/fixtures/questions.jsonl` has at least 3 test questions
- [ ] Evals excluded from `bun test` (only run via `HARNESS_LIVE=1 bun run eval`)
- [ ] `package.json` has an `eval` script wired to `@harness/cli`

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] `HARNESS_LIVE=1 bun run eval` runs without crash (live-gated)

**Dependencies:** Task 5 (needs working app to evaluate)

**Files likely touched:**
- `evals/factuality.eval.ts` (new)
- `evals/citation.eval.ts` (new)
- `evals/fixtures/questions.jsonl` (new)
- `package.json` (add eval script)

**Estimated scope:** Medium (4 files)

---

### Task 12: Write README

**Description:** Create `apps/deep-research/README.md` with first-run instructions, flag reference, env vars, architecture overview, and fork instructions.

**Acceptance criteria:**
- [ ] Covers: installation, first run, all flags, env vars, output format
- [ ] Explains the graph topology briefly
- [ ] Links to the spec for deeper context
- [ ] Includes fork/customize instructions (swap tools, prompts, schemas)

**Verification:**
- [ ] Manual: follow README from scratch, app runs

**Dependencies:** Task 5 (needs final API surface to document)

**Files likely touched:**
- `README.md` (new)

**Estimated scope:** XS (1 file)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `subagentAsTool` + `handoff` + `graph` composition may surface bugs in harness packages | High | Build incrementally; test each primitive in isolation before wiring together |
| MCP optional import might break bundling | Med | Dynamic `import()` with try/catch; test with and without `@harness/mcp` installed |
| Budget carve-up math across parallel subagents is tricky | Med | Start with top-level cap only; add per-agent split only after top-level works |
| Fact-checker retry loop could produce confusing graph state | Med | Hard cap of 2 retries; track retry count in graph state; test the edge |
| sqlite optional dep import might fail at runtime | Low | Graceful fallback to inMemory with console warning |

## Open Questions

- Confirm spec §14 open questions are resolved before starting Tasks 6 (sqlite) and 1 (MCP search default)
- Should the writer output structured JSON (parsed to `Report`) or markdown text (parsed after)?
- Should budget enforcement use the event bus or direct tracker checks in the graph?
