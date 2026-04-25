# Architecture Improvement Plan — 2026-04

**Status:** Draft (read-only plan, awaiting human review) · **Owner:** @tien
**Date:** 2026-04-25
**Source review:** in-conversation deep review (this file is the actionable breakdown)
**Related:** `docs/specs/architecture-review-2026-04.md` (prior review — this plan executes its open P0/P1 items plus newly-identified work)

---

## Goals

1. **Less code.** Remove wrappers, helpers, and abstractions that don't pay rent.
2. **Per-step observability.** A run produces a readable, ordered log of every step / tool call / approval / token-usage event.
3. **Zod-first HTTP.** Routes parse via middleware, never hand-rolled.
4. **Honest folder structure.** 4 packages instead of 7; `core` keeps only what it needs; Mastra primitives consolidated.
5. **No behavior regressions.** `bun run ci` green after every task.

## Non-goals

- No new features.
- No Postgres / persistence work (still in-memory).
- No multi-tenancy, auth, or HTTP versioning.
- No replacing Mastra; we double down on it as the default runtime.

---

## Package DAG (current → target)

**Current (7 packages):**
```
tools ─┐
agents ─┼─→ capabilities ─→ core ─→ http
workflows ─┘                       ↑
                       apps/api ───┘
                       apps/console (http types only)
```

**Target (4 packages + bootstrap):**
```
mastra (tools, agents, workflows, capabilities)
   │
   ▼
core ─→ http
   │       │
   └→ bootstrap ←─┘
         │
         ▼
   apps/api · apps/cli · apps/console (types only)
```

`mastra` consolidates the four Mastra-coupled packages. `bootstrap` exports `composeHarness({ stores, capabilities, providers, ... })` consumed by every app.

DAG must remain acyclic. Biome `noRestrictedImports` rules updated alongside each move.

---

## Vertical slicing principle

Each task below delivers **one complete change end-to-end**: source edit + tests + typecheck + build + (where relevant) route adjustment. No "do all the deletes, then all the rewrites" horizontal layers. Every task ends with `bun run ci` green.

Verification gate after **every** task:
```bash
bun run lint
bun run typecheck
bun run build
bun test
# combined:
bun run ci
```

If any step fails, fix in the same task. Do not push a red commit.

---

# Phase 1 — Dead-weight removal (low-risk deletions)

**Goal:** Net LOC reduction ≈ 350. No public-API change. No behavior change.
**Branch:** `chore/phase-1-dead-weight`
**Single PR.**

### T1.1 — Delete `withModelOverride` HOF
**Why:** 15-line closure-on-closure HOF whose `__createWithModel` field is unused on the run path. Capabilities already accept `model` via settings.
**Files:**
- delete `packages/capabilities/src/with-model-override.ts`
- `packages/capabilities/src/simple-chat/capability.ts` — return `CapabilityDefinition` directly
- `packages/capabilities/src/deep-research/capability.ts` — same
- `packages/capabilities/src/index.ts` — remove the re-export
**Acceptance:**
- `withModelOverride` referenced nowhere (`grep -r withModelOverride packages/ apps/` empty)
- Both capabilities still register and run the existing `*.test.ts` suites unchanged
- `bun run ci` green

### T1.2 — Hoist `resolveModel` into `core/providers`
**Why:** Identical 6-line function duplicated across both capabilities.
**Files:**
- new `packages/core/src/providers/resolve-model.ts` exporting `resolveModel(raw: unknown): MastraModelConfig`
- `packages/core/src/providers/index.ts` — export it
- both capabilities — import and use
**Acceptance:**
- one definition; two call sites
- existing capability tests unchanged
- `bun run ci` green

### T1.3 — Inline `buildStudioConfig`
**Why:** 16-line wrapper that composes two factories. Used once.
**Files:**
- delete `packages/capabilities/src/studio-config.ts` and `studio-config.test.ts`
- `mastra.config.ts` — call `createSimpleChatAgent` and `createDeepResearchWorkflow` inline
- `packages/capabilities/src/index.ts` — drop the export
**Acceptance:**
- `bun run studio:dev` starts on `:4111` with both agent and workflow visible
- `bun run ci` green

### T1.4 — Extract single `extractJson` helper
**Why:** Fenced-code-block stripper duplicated 4× across step files.
**Files:**
- new `packages/workflows/src/deep-research/json.ts` with `extractJson(text: string): string`
- `plan-step.ts`, `research-step.ts`, `report-step.ts`, `fact-check-step.ts` — import; delete local copy
**Acceptance:**
- `grep -c 'function extractJson' packages/workflows/src/deep-research/` returns `1`
- `bun test packages/workflows` green

### T1.5 — Replace hand-rolled `zodToJsonSchema` with `z.toJSONSchema`
**Why:** 157-line schema introspector reimplements what Zod v4 ships natively.
**Files:**
- `packages/http/src/routes/capabilities.routes.ts` — delete `getZodDef`, `getCheckDef`, `zodToJsonSchema`; call `z.toJSONSchema(schema)`
**Acceptance:**
- snapshot test added that locks the JSON schema shape for `simple-chat` and `deep-research` input/settings (one snapshot per capability)
- `GET /capabilities/:id` response shape preserved (manual check + assertions in `routes.test.ts`)
- `bun run ci` green

### T1.6 — Drop `Logger` wrapper around pino
**Why:** Custom `Logger` interface mirrors pino's surface verbatim (`debug`/`info`/`warn`/`error`/`child`); the wrap adds no value.
**Files:**
- `packages/core/src/observability/logger.ts` — `export type Logger = pino.Logger; export function createPinoLogger(opts) { return pino(opts); }`
- `packages/core/src/domain/capability.ts` — drop the local `Logger` interface; re-export pino's
- `packages/core/src/observability/logger.test.ts` — drop the wrapper-shape assertions, keep "info() writes JSON"
**Acceptance:**
- ~25 LOC removed
- all callers compile (Logger surface is identical)
- `bun run ci` green

### T1.7 — Inline `runtime/singleton.ts`
**Why:** 37 LOC for a single-flight wrapper used in one place.
**Files:**
- delete `packages/core/src/runtime/singleton.ts`, `runtime/index.ts`, `runtime/` folder
- inline at the call site
- `packages/core/src/index.ts` — drop the runtime re-export
**Acceptance:**
- `runtime/` folder gone
- `bun run ci` green

### T1.8 — Stop re-exporting executor internals
**Why:** `mapStreamChunk` and `RuntimeStreamChunk` are run-executor implementation details, leaked through `runs/index.ts` → `core/index.ts`.
**Files:**
- `packages/core/src/runs/index.ts` — drop the two re-exports
**Acceptance:**
- nothing outside `packages/core/src/runs/` imports `mapStreamChunk` (`grep` empty)
- `bun run ci` green

### ✅ Checkpoint 1 (after T1.1–T1.8)
- `bun run ci` green
- `git diff --stat main..HEAD` shows net deletion ≈ 300–400 LOC
- No public-API change visible to `apps/*`
- **Human review gate:** confirm Phase 1 is acceptable before Phase 2

---

# Phase 2 — Zod-as-middleware + OpenAPI from Zod

**Goal:** Routes parse via `@hono/zod-validator`; OpenAPI spec auto-derived from Zod; `openapi.ts` deleted.
**Branch:** `refactor/phase-2-zod-routes`
**Single PR.**

### T2.1 — Adopt `@hono/zod-validator`; convert `health` + `models` first
**Why:** Smallest routes — exercise the new pattern end-to-end without churn.
**Files:**
- `packages/http/package.json` — add `@hono/zod-validator`
- `packages/http/src/routes/health.routes.ts`, `models.routes.ts` — convert
**Acceptance:**
- `routes.test.ts` for `/health` and `/models` unchanged green
- `bun run ci` green

### T2.2 — Convert `runs` routes
**Why:** Most parsing logic; biggest payoff.
**Files:**
- `packages/http/src/routes/runs.routes.ts`
- new `runs.schemas.ts` exporting `StartRunBody`, `ListRunsQuery` (`status` enum, `capabilityId`, `limit` with `z.coerce.number().int().positive().max(500).optional()`)
**Acceptance:**
- 13-line manual query parsing block replaced by one schema
- `routes.test.ts` `/runs` cases (list, post, get, cancel, delete, events) all pass
- `bun run ci` green

### T2.3 — Convert `approvals` and merge into `runs.routes.ts`
**Why:** `approvalsRoutes` mounts at `/runs` alongside `runsRoutes` — two routers, one prefix. Confusing.
**Files:**
- delete `packages/http/src/routes/approvals.routes.ts`
- move `/:id/approve` and `/:id/reject` into `runs.routes.ts`
- `packages/http/src/app.ts` — drop the second `app.route('/runs', approvalsRoutes(deps))` mount
**Acceptance:**
- one router under `/runs`
- `routes.test.ts` approve + reject cases pass
- `bun run ci` green

### T2.4 — Convert `capabilities`, `conversations`, `settings` routes
**Files:** the three remaining route files
**Acceptance:**
- all manual `Body.parse(await c.req.json())` removed
- `routes.test.ts` green
- `bun run ci` green

### T2.5 — Auto-derive OpenAPI from Zod via `hono-openapi`
**Why:** `openapi.ts` is 450 LOC hand-written; drifts from reality.
**Files:**
- `packages/http/package.json` — add `hono-openapi` (or `@hono/zod-openapi` if API-style preferred — decide in T2.5.0 spike)
- T2.5.0 — 30-min spike: pick one (`hono-openapi` is lighter-touch; `@hono/zod-openapi` requires per-route `createRoute`). Document choice in PR.
- each route file — annotate with the chosen library's metadata helper
- delete `packages/http/src/openapi.ts` (keep `getScalarHtml` — move into `app.ts`)
- `packages/http/src/openapi.test.ts` — replace whole-spec snapshot with: "every route declared in `app.ts` appears in `/openapi.json` with matching method"
**Acceptance:**
- `GET /openapi.json` returns a valid OpenAPI 3.1 doc
- `GET /docs` (Scalar) renders without errors
- new test: every Hono route is represented in the spec
- LOC removed > LOC added
- `bun run ci` green

### ✅ Checkpoint 2 (after T2.1–T2.5)
- `bun run ci` green
- All routes parse via Zod middleware
- OpenAPI auto-derived
- `errorHandler` already maps `ZodError` → 400, no change needed
- **Human review gate**

---

# Phase 3 — Executor + capability cleanup

**Goal:** Settings validated once at the boundary; runner protocol simplified; storage folder cleaned; per-run Mastra allocation removed.
**Branch:** `refactor/phase-3-executor`
**Single PR.**

### T3.1 — Validate settings in `RunExecutor`
**Why:** Every capability casts `settings as T`. No validation. Wrong settings produce cryptic mid-run errors.
**Files:**
- `packages/core/src/runs/run-executor.ts` — call `capability.settingsSchema.parse(params?.settings ?? {})` before constructing `ExecutionContext`; on `ZodError` emit `run.failed { code: 'INVALID_SETTINGS', message }` and return
- `packages/core/src/domain/capability.ts` — `ExecutionContext<S>` already generic on settings; tighten to typed `S`
- both capabilities — drop `as DeepResearchSettings` / `as SimpleChatSettings` casts
- `packages/core/src/runs/run-executor.test.ts` — add test: starting a run with invalid settings produces `run.failed` with `INVALID_SETTINGS`
**Acceptance:**
- no `as SimpleChatSettings` / `as DeepResearchSettings` in capabilities (`grep` empty)
- new test passes
- existing run-executor tests unchanged
- `bun run ci` green

### T3.2 — Collapse `CapabilityRunner` discriminated union
**Why:** Two big branches in `run-executor.executeRunner()` with 5 distinct protocol fields (`extractPrompt`, `extractInput`, `extractPlan`, `approveStepId`, `maxSteps`). Run-executor handles plumbing that capabilities should own.
**Files:**
- `packages/core/src/domain/capability.ts` — replace `CapabilityRunner` union with `runner: (ctx: ExecutionContext<S>) => AsyncIterable<StreamEventPayload>`
- new `packages/capabilities/src/runners/agent-runner.ts` — `agentRunner({ build, extractPrompt, maxSteps })` returns the AsyncIterable
- new `packages/capabilities/src/runners/workflow-runner.ts` — `workflowRunner({ build, extractInput, approval })` returns the AsyncIterable; encapsulates the `wfRun.start` / `suspended` / `resume` dance
- `packages/core/src/runs/run-executor.ts` — `executeRunner` becomes a one-liner: `yield* capability.runner(ctx)`
- both capabilities — wrap their `Agent` / `Workflow` in the helpers
**Acceptance:**
- `executeRunner` ≤ 5 LOC
- all capability + executor tests green
- new helpers unit-tested in `packages/capabilities/src/runners/*.test.ts`
- `bun run ci` green

### T3.3 — Hoist Mastra+LibSQL allocation out of `runner.build`
**Why:** `deep-research/capability.ts` allocates `new Mastra({ ... LibSQLStore({ url: 'file::memory:?cache=shared' }) })` **per run**.
**Files:**
- `packages/capabilities/src/deep-research/capability.ts` — instantiate `Mastra` once at module load (or in registry init); `runner.build(settings)` only varies the workflow's runtime arguments
**Acceptance:**
- LibSQL connection count constant under sequential runs (manual: run 5 in a loop, observe one allocation)
- existing `deep-research` tests green
- `bun run ci` green

### T3.4 — Rename `inmem-*` → `storage/memory/`
**Why:** All 7 storage files prefixed `inmem-` even though only one impl exists; the prefix is repeated in the filename and the folder.
**Files:**
- move `packages/core/src/storage/inmem-*.ts` → `packages/core/src/storage/memory/*.ts` (drop prefix)
- update imports across `core/` and `apps/`
- `packages/core/src/storage/index.ts` — re-export from `./memory/`
**Acceptance:**
- file tree: `storage/memory/{run-store,event-log,event-bus,approval-store,approval-queue,conversation-store,settings-store}.ts`
- public exports unchanged (`createInMemoryRunStore` etc still work)
- `bun run ci` green

### ✅ Checkpoint 3 (after T3.1–T3.4)
- `bun run ci` green
- Capabilities ~30% shorter
- Settings validation enforced; new failure-path test
- `RunExecutor.executeRunner` reduced to a thin loop
- **Human review gate**

---

# Phase 4 — Per-step logging + folder consolidation

**Goal:** Every step / tool-call / approval logged in order. 7 packages → 4. `apps/api/src/compose.ts` becomes ~10 LOC.
**Branch:** `refactor/phase-4-logging-and-layout`
**Two PRs** (logging first, then the package move) to keep diffs reviewable.

## Phase 4a — Per-step logging (PR a)

### T4a.1 — Log every `SessionEvent` from `RunExecutor`
**Why:** All runtime events already pass through `mapStreamChunk`. One log line per event = full trace, free.
**Files:**
- `packages/core/src/runs/run-executor.ts` — after `for await (const payload of stream)`, call `logger.info('event', { type: payload.type, ...summary(payload) })`
- summary helper: for `text.delta` log only `{ chars: text.length }` (avoid noise); for others log full payload at debug; tool/approval events at info
- `packages/core/src/runs/run-executor.test.ts` — add test: capture logger calls, assert event types appear in order
**Acceptance:**
- a single run produces logs in the form `run.started → step.start → tool.called → tool.result → step.finished → run.finished`
- `text.delta` does not flood logs at info level
- `bun run ci` green

### T4a.2 — `loggedStep` helper in workflows
**Why:** Mastra `createStep` doesn't log step entry/exit; we want `step.start` / `step.end { durationMs, status }` for every workflow step.
**Files:**
- new `packages/workflows/src/lib/logged-step.ts` exporting `loggedStep(id, schemas, fn)` that wraps `createStep` with logger calls before/after `execute`
- thread `logger` via Mastra `runtimeContext`: in `workflow-runner.ts` (T3.2), call `wfRun.start({ inputData, runtimeContext: { logger: ctx.logger } })`
- `packages/workflows/src/deep-research/{plan,research,report,fact-check}-step.ts` — adopt `loggedStep`
- new `lib/logged-step.test.ts`
**Acceptance:**
- a deep-research run produces `step.start plan / step.end plan { durationMs } / step.start approve / ...` in order
- `bun run ci` green

### T4a.3 — Log mid-step events (fact-check retries, agent calls)
**Why:** The `write-and-check` loop runs up to 3 iterations; the user wants to see each retry.
**Files:**
- `packages/workflows/src/deep-research/index.ts` — inside `write-and-check.execute`, read logger from `runtimeContext` and `logger.info('fact-check.attempt', { retry, passed })`
- agent factories (`simple-chat.ts`, planner/researcher/writer/checker) — accept optional `logger` and log `agent.start { id }` and `agent.finish { id }` (already covered by event-stream logs from T4a.1, but mid-step agents bypass the event stream → explicit log)
**Acceptance:**
- `HARNESS_LIVE=1` deep-research run trace shows every fact-check retry
- `bun run ci` green

### ✅ Checkpoint 4a (after T4a.1–T4a.3)
- `bun run ci` green
- Manual trace of one run reads top-to-bottom and explains exactly what happened
- **Human review gate** before consolidating packages

## Phase 4b — Package consolidation (PR b)

### T4b.1 — Create `packages/mastra/`; move `tools` in first
**Why:** Smallest package; lowest blast radius for the move pattern.
**Files:**
- new `packages/mastra/package.json` (depends on `@mastra/core`, `zod`)
- move `packages/tools/src/*` → `packages/mastra/src/tools/*`
- new `packages/mastra/src/index.ts` re-exports `./tools`
- delete `packages/tools/`
- update imports across the repo (`@harness/tools` → `@harness/mastra`)
- update `biome.json` `noRestrictedImports` rules
- update `bun.lock` via `bun install`
**Acceptance:**
- `@harness/tools` referenced nowhere
- `bun run ci` green

### T4b.2 — Move `agents` into `packages/mastra/src/agents/`
**Files:** mirror T4b.1
**Acceptance:** `@harness/agents` referenced nowhere; `bun run ci` green

### T4b.3 — Move `workflows` into `packages/mastra/src/workflows/`
**Files:** mirror T4b.1
**Acceptance:** `@harness/workflows` referenced nowhere; `bun run ci` green

### T4b.4 — Move `capabilities` into `packages/mastra/src/capabilities/`
**Files:** mirror T4b.1
**Acceptance:** `@harness/capabilities` referenced nowhere; `bun run ci` green

### T4b.5 — Extract `composeHarness()` into `packages/bootstrap/`
**Why:** `apps/api/src/compose.ts` (90 LOC) wires every store + executor + capability registry. Same wiring will be needed by `apps/cli`. Hexagonal claim is real only if there are 2+ apps.
**Files:**
- new `packages/bootstrap/package.json` (depends on `@harness/core`, `@harness/mastra`)
- new `packages/bootstrap/src/compose.ts` exporting `composeHarness({ config, capabilities?, stores? })` returning `{ deps, shutdown }`
- `apps/api/src/compose.ts` — call `composeHarness()`; wrap with `createHttpApp(deps)`; ≈ 10 LOC
- `apps/api/src/compose.test.ts` (or smoke test) — start app, hit `/health`
**Acceptance:**
- `apps/api/src/compose.ts` ≤ 15 LOC
- `bun run api` boots and serves `/health`
- `bun run ci` green

### T4b.6 — Add `apps/cli` to prove the layering (optional but recommended)
**Why:** Validates `composeHarness` is reusable; resolves prior review's P0-4.
**Files:**
- new `apps/cli/package.json`, `src/main.ts`
- `main.ts`: `composeHarness()` → `startRun({ capabilityId: 'simple-chat', input: { message: process.argv[2] } })` → subscribe to `streamRunEvents` → write JSON-lines to stdout
**Acceptance:**
- `bun run --filter @harness/example-cli start "what is 2+2"` runs and prints stream
- `packages/http` not imported under `apps/cli` (`grep` empty)
- `bun run ci` green

### T4b.7 — Update `CLAUDE.md` to reflect 4-package layout
**Files:** `CLAUDE.md` — DAG diagram, package list, biome rules section
**Acceptance:** doc matches reality

### ✅ Checkpoint 4b (after T4b.1–T4b.7)
- `bun run ci` green
- 4 packages (`core`, `mastra`, `http`, `bootstrap`) + 3 apps (`api`, `console`, `cli`)
- Deleting `packages/mastra/` leaves `core` + `http` + `bootstrap` building (verify in scratch branch)
- **Final human review gate**

---

# Out-of-scope (intentionally not in this plan)

- **`EventBus` rewrite.** 144-LOC hand-rolled async iterator works correctly; cost is reading complexity, not behavior. Defer.
- **Postgres storage.** Separate project; this plan is in-memory only.
- **Conditional-spread elimination.** Side-effect of `exactOptionalPropertyTypes`; would touch dozens of files for stylistic gain. Defer or address opportunistically inside other tasks.
- **MCP server/client.** Not a priority per prior review.
- **Replacing pino.** Just stop wrapping it (T1.6).

---

# Risk register

| Risk | Mitigation |
|---|---|
| `z.toJSONSchema` (T1.5) emits a different shape than the hand-rolled version | Snapshot test before/after; compare; adapt console if needed |
| `hono-openapi` choice (T2.5) doesn't fit Hono v4 patterns | T2.5.0 spike before commit; fallback is to keep `openapi.ts` and just deduplicate against route Zod schemas |
| Per-run Mastra hoist (T3.3) leaks state across runs | Audit Mastra docs for re-use semantics; if shared state is unsafe, memoize per-settings-hash instead |
| Package moves (T4b.*) break console build via stale imports | Each move is a single PR-eligible task; CI verifies; one rollback per move |
| Loss of test coverage during runner-protocol collapse (T3.2) | Helpers (`agentRunner`, `workflowRunner`) unit-tested separately; run-executor tests unchanged |

---

# Execution order summary

1. **Phase 1** (single PR): T1.1 → T1.8 — deletions, no behavior change
2. **🛑 Checkpoint 1** — human review
3. **Phase 2** (single PR): T2.1 → T2.5 — Zod middleware + OpenAPI
4. **🛑 Checkpoint 2** — human review
5. **Phase 3** (single PR): T3.1 → T3.4 — executor + capabilities cleanup
6. **🛑 Checkpoint 3** — human review
7. **Phase 4a** (PR): T4a.1 → T4a.3 — per-step logging
8. **🛑 Checkpoint 4a** — human review
9. **Phase 4b** (PR): T4b.1 → T4b.7 — package consolidation
10. **🛑 Checkpoint 4b** — final review

After every task: `bun run ci` must be green. After every checkpoint: explicit human go/no-go.
