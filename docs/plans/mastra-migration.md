# Plan — Mastra Framework Migration

**Status:** Draft · **Owner:** @tien · **Date:** 2026-04-23
**Spec:** [`docs/specs/mastra-migration.md`](../specs/mastra-migration.md)

This plan translates the spec into an ordered set of phases. Each phase is a vertical slice: it ends with something testable and a green `bun run ci`. Strangler approach — old `@harness/*` packages keep working for `apps/server` and `apps/web` until they migrate later.

---

## Migration strategy

1. **Strangler, not big-bang.** Install Mastra alongside the harness; stand up parallel objects; flip `apps/web-studio`'s imports; then delete the now-orphaned harness packages.
2. **web-studio is the only app migrated this pass.** `apps/server` and `apps/web` stay on `@harness/*`. `apps/cli-chat` and `packages/tui` are deleted outright (per Q1/Q6).
3. **Phases are independently shippable.** Each phase ends in a commit (or small commit series) that leaves `master` green. You can stop after any phase and the repo is consistent.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mastra API shape shifts (v1.x is young) | Pin versions via `exact = true`; upgrade deliberately w/ changeset entry |
| LibSQL `.db` ergonomics differ from `bun:sqlite` | Use `file::memory:?cache=shared` in tests; real file only in dev/prod |
| Custom Langfuse spans break | Keep harness telemetry around until Phase 5 verifies parity |
| HITL UX regresses | Port modal first w/ fake workflow; only switch backend after UI works |
| web-studio SSE protocol differs from Mastra's event stream | Write a thin shared translator in `apps/web-studio/src/server/infra/events.ts`; document the map |
| Blocking `mastra dev` on a non-standard layout | If `mastra dev --config ./mastra.config.ts` doesn't discover root config, fall back to `apps/web-studio/src/mastra/index.ts` as the config entry |
| Deleting packages cascades into `apps/server` or `apps/web` | Deletions happen in Phase 6 only, after grep confirms zero consumers |

## Parallelizable work

- Phases 1 and 2 can run in parallel (install Mastra infra ↔ port tool implementations).
- Within Phase 3 and Phase 4, agent and workflow work are independent.
- Phase 6 (deletions) is strictly last.

---

## Phases

### Phase 0 — Preflight & spike (½ day)

Goal: prove the Mastra integration points work in isolation before touching the app.

- [ ] **Task 0.1:** Create working branch `feat/mastra-migration`.
  - Acceptance: branch exists, tracks `master`.
  - Verify: `git status` clean on branch.
  - Files: n/a.
- [ ] **Task 0.2:** Add Mastra to root `package.json` devDependencies (`mastra`) and runtime deps (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`).
  - Acceptance: `bun install` succeeds; lockfile updated; `exact = true` preserved.
  - Verify: `bun install --frozen-lockfile` post-commit; `grep '@mastra/core' bun.lock`.
  - Files: `package.json`, `bun.lock`.
- [ ] **Task 0.3:** Create `mastra.config.ts` at repo root with an empty `new Mastra({ agents: {}, workflows: {}, storage: new LibSQLStore({...}) })`.
  - Acceptance: `bunx mastra dev --config mastra.config.ts` boots Studio on `:4111`.
  - Verify: manual — hit `http://localhost:4111` in browser.
  - Files: `mastra.config.ts`.
- [ ] **Task 0.4:** Add `.mastra/` to `.gitignore`.
  - Acceptance: LibSQL dev DB not tracked.
  - Verify: `git check-ignore .mastra/mastra.db` → exits 0.
  - Files: `.gitignore`.

**Checkpoint:** `bun run ci` green; `mastra dev` boots with no content.

---

### Phase 1 — New `packages/tools` (Mastra tools) (1 day)

Port the two simple-chat tools and the existing fs/fetch tools to Mastra `createTool`. Old `@harness/tools` stays untouched until Phase 6.

- [ ] **Task 1.1:** Create new workspace `packages/tools-mastra/` (temporary name; rename in Phase 6). `package.json`, `tsconfig.json`, `src/index.ts`.
  - Acceptance: builds clean; exported from workspace.
  - Verify: `bun run --filter @harness/tools-mastra build`.
  - Files: `packages/tools-mastra/{package.json,tsconfig.json,src/index.ts}`.
- [ ] **Task 1.2 (TDD):** `calculatorTool` — write test first with Mastra's `createTool` contract, then implement. Copy logic from `apps/web-studio/src/server/features/simple-chat/tools/calculator.ts`.
  - Acceptance: test green; same arithmetic surface.
  - Verify: `bun test packages/tools-mastra/src/calculator.test.ts`.
  - Files: `src/calculator.ts`, `src/calculator.test.ts`.
- [ ] **Task 1.3 (TDD):** `getTimeTool` — mirror 1.2 for time tool.
  - Files: `src/get-time.ts`, `src/get-time.test.ts`.
- [ ] **Task 1.4 (TDD):** Port `fs` + `fetch` tools from `packages/tools` to Mastra form.
  - Acceptance: input/output schemas match old Zod shapes; error semantics preserved (tool error → `isError: true` equivalent in Mastra).
  - Verify: new colocated tests cover the same cases as `packages/tools/src/{fs,fetch}.test.ts`.
  - Files: `src/fs.ts`, `src/fetch.ts`, + tests.
- [ ] **Task 1.5:** Barrel export from `src/index.ts`.
  - Files: `src/index.ts`.

**Checkpoint:** All tool tests pass; `bun run ci` green. Nothing imports these yet — they sit idle.

---

### Phase 2 — New `packages/agents` (simple-chat) (½ day)

- [ ] **Task 2.1:** Create workspace `packages/agents/` + scaffolding.
  - Files: `packages/agents/{package.json,tsconfig.json,src/index.ts}`.
- [ ] **Task 2.2:** Add `packages/agents/src/testing.ts` exporting `mockModel(responses: ScriptedResponse[])` wrapping `MockLanguageModelV1` from `ai`.
  - Acceptance: lets tests drive an Agent without live calls.
  - Verify: used in 2.3's test.
  - Files: `src/testing.ts`, `src/testing.test.ts`.
- [ ] **Task 2.3 (TDD):** `simpleChatAgent` — test drives a 2-turn conversation w/ a tool call; implement using `new Agent({ tools: { calculatorTool, getTimeTool }, memory })`.
  - Acceptance: test green; agent uses memory; streams token events.
  - Verify: `bun test packages/agents/src/simple-chat.test.ts`.
  - Files: `src/simple-chat.ts`, `src/simple-chat.test.ts`.
- [ ] **Task 2.4:** Export from barrel.
  - Files: `src/index.ts`.
- [ ] **Task 2.5:** Register `simpleChatAgent` in root `mastra.config.ts`.
  - Acceptance: `mastra dev` Studio lists the agent; can invoke it from Studio UI.
  - Verify: manual.
  - Files: `mastra.config.ts`.

**Checkpoint:** Agent runs in Studio end-to-end. Web-studio still uses `@harness/agent` — not touched yet.

---

### Phase 3 — web-studio backend flip: simple-chat first (1–1.5 days)

Swap web-studio's simple-chat handler to invoke `simpleChatAgent` from `@harness/agents`. Deep Research stays on `@harness/agent` until Phase 4. Both must coexist.

- [ ] **Task 3.1:** Add `@harness/agents` + `@harness/tools-mastra` to `apps/web-studio/package.json` dependencies.
  - Files: `apps/web-studio/package.json`.
- [ ] **Task 3.2:** Replace `apps/web-studio/src/server/features/simple-chat/` tool+agent construction with import from `@harness/agents`.
  - Acceptance: the feature still exposes the same `ToolDef` shape consumed by `tools.registry.ts`.
  - Verify: `bun test apps/web-studio/src/server/features/simple-chat/**`.
  - Files: `simple-chat/index.ts`, possibly `simple-chat/simple-chat.test.ts`.
- [ ] **Task 3.3:** Introduce a `MastraRunner` alongside the existing harness runner — adapt Mastra's agent `stream()` output into the existing SSE `AgentEvent` shape (`shared/events.ts`).
  - Acceptance: SSE protocol unchanged for the UI. Translator lives in `apps/web-studio/src/server/infra/mastra-events.ts`.
  - Verify: `apps/web-studio/src/server/index.test.ts` passes; golden SSE output matches pre-migration snapshot for simple-chat.
  - Files: `src/server/infra/mastra-events.ts` (new); `sessions.runner.ts` (dispatch).
- [ ] **Task 3.4:** Route `conversationId` → Mastra `threadId` + `resourceId` in the runner when the tool is `simple-chat`.
  - Acceptance: memory persists across requests; verified by hitting the same conversation 3x.
  - Verify: integration test: 3 sequential POSTs, last response references the first.
  - Files: `sessions.runner.ts`, `sessions.routes.ts`, possibly `api.ts`.
- [ ] **Task 3.5:** Manual browser test: `bun run web`, pick simple-chat, 3 turns, verify tool-call rendering and streaming tokens visible.
  - Acceptance: UX indistinguishable from pre-migration.
  - Verify: manual; note in commit message.

**Checkpoint:** Simple-chat runs on Mastra; Deep Research still runs on harness; both work. `bun run ci` green.

---

### Phase 4 — Deep Research as Mastra Workflow + HITL (2–3 days)

Rewrite the graph-based pipeline as a Mastra Workflow. The current 4-node graph (plan → research → fact-check → report) becomes 4 steps with `suspend()` between plan and research for HITL.

- [ ] **Task 4.1:** Create `packages/workflows/` workspace.
  - Files: `packages/workflows/{package.json,tsconfig.json,src/index.ts}`.
- [ ] **Task 4.2 (TDD):** Step 1 — `planStep` as a `createStep({...})` that takes the user question and produces a plan. Reuses the existing plan prompt from `apps/web-studio/src/server/features/deep-research/plan/`.
  - Acceptance: unit test feeds a mock model; asserts step output matches the plan schema.
  - Files: `src/deep-research/plan-step.ts` + test.
- [ ] **Task 4.3 (TDD):** Step 2 — `researchStep` (sub-agent w/ budgets). Uses `Agent` composition — today's `subagentAsTool` pattern → Mastra sub-agent call.
  - Files: `src/deep-research/research-step.ts` + test.
- [ ] **Task 4.4 (TDD):** Step 3 — `factCheckStep`.
  - Files: `src/deep-research/fact-check-step.ts` + test.
- [ ] **Task 4.5 (TDD):** Step 4 — `reportStep`.
  - Files: `src/deep-research/report-step.ts` + test.
- [ ] **Task 4.6:** Compose into `deepResearchWorkflow = createWorkflow(...).then(planStep).suspend().then(researchStep).then(factCheckStep).then(reportStep).commit()` (syntax per Mastra v1 docs — verify at implementation time).
  - Acceptance: workflow runs end-to-end with mock model; suspends after plan, resumes with approval payload.
  - Verify: `bun test packages/workflows/src/deep-research/deep-research.test.ts`.
  - Files: `src/deep-research/index.ts` + test.
- [ ] **Task 4.7:** Register workflow in `mastra.config.ts`.
  - Files: `mastra.config.ts`.
- [ ] **Task 4.8:** Swap `apps/web-studio/src/server/features/deep-research/` backend to drive the workflow. Plan-approval HITL: on `suspend` event, emit the existing `plan.pending` SSE event shape; on approve, call `workflow.resume({...})`.
  - Acceptance: existing `PlanApprovalModal` works unchanged; backend no longer imports `@harness/hitl`.
  - Verify: manual run-through + existing route tests.
  - Files: `sessions.runner.ts`, `deep-research/index.ts`, remove old graph wiring.
- [ ] **Task 4.9:** Manual browser test: deep research golden path with plan approval.

**Checkpoint:** Deep Research runs on Mastra Workflow; both tools pass. `bun run ci` green. `mastra dev` Studio shows the workflow graph and traces.

---

### Phase 5 — Telemetry & evals (1 day)

- [ ] **Task 5.1:** Configure Mastra telemetry in `mastra.config.ts` — service name, sampling, OTel exporter pointed at your local collector (or the same Langfuse endpoint).
  - Acceptance: traces land in Langfuse with agent/workflow spans.
  - Verify: run 3 simple-chat turns + 1 deep research; confirm in Langfuse UI.
  - Files: `mastra.config.ts`.
- [ ] **Task 5.2:** Port one eval spec from `packages/eval/*.eval.ts` to `@mastra/evals` format as a pilot.
  - Acceptance: `bun run mastra:eval` runs the eval; result visible in Studio.
  - Verify: Studio eval tab shows pass/fail.
  - Files: `packages/agents/src/simple-chat.eval.ts` (or similar).
- [ ] **Task 5.3:** Add `mastra:dev`, `mastra:build`, `mastra:eval` scripts to root `package.json`. Remove `eval` and `research` and `chat` scripts (cli-chat/deep-research-cli no longer exist).
  - Files: `package.json`.

**Checkpoint:** Telemetry + at least one eval green. Studio is authoritative for both.

---

### Phase 6 — Deletions (½ day)

**Precondition:** grep confirms zero consumers outside of doomed packages themselves.

- [ ] **Task 6.1:** Delete `apps/cli-chat/` and root `chat` script.
  - Verify: `git grep '@harness/example-cli-chat'` → empty.
  - Files: `apps/cli-chat/**`, `package.json`.
- [ ] **Task 6.2:** Delete `packages/tui/`.
  - Verify: `git grep '@harness/tui'` → empty.
  - Files: `packages/tui/**`.
- [ ] **Task 6.3:** For each harness package superseded by Mastra, verify zero imports from `apps/web-studio` then decide: if `apps/server` and `apps/web` still import it, **keep for now** (follow-up migration); if zero consumers, **delete**. Candidates:
  - `@harness/agent`, `@harness/core`, `@harness/llm-adapter` — likely still used by server/web → keep.
  - `@harness/hitl` — only web-studio consumed it → delete.
  - `@harness/eval`, `@harness/cli` — only eval script → delete.
  - `@harness/mcp` — check consumers; likely delete.
  - `@harness/memory-sqlite`, `@harness/session-store`, `@harness/session-events` — check consumers.
  - `@harness/observability` — check consumers; keep if Langfuse parity not yet verified.
  - `@harness/tools` (the old one) — delete once `@harness/tools-mastra` renamed.
  - Acceptance: per-package decision documented in commit message.
  - Verify: `bun run ci` after each deletion.
- [ ] **Task 6.4:** Rename `packages/tools-mastra/` → `packages/tools/` (the old one is gone).
  - Acceptance: workspace name `@harness/tools`; importers updated.
  - Verify: `bun run ci`.
- [ ] **Task 6.5:** Update root `CLAUDE.md`:
  - Revise §"Architecture — dependency DAG" to the 2-layer shape.
  - Drop non-goals that no longer apply (RAG/vector still stands — Mastra offers it but we opt out).
  - Replace §"Shape invariants" items that referenced the custom harness (stream-first, plain interfaces) with Mastra-oriented equivalents.
  - Acceptance: CLAUDE.md accurately describes the post-migration repo.
  - Verify: read-through + user sign-off.
  - Files: `CLAUDE.md`.
- [ ] **Task 6.6:** Add a changeset entry.
  - Files: `.changeset/mastra-migration.md`.

**Checkpoint:** `bun run ci` green; repo is materially smaller (`find packages -type d -maxdepth 1 | wc -l` drops substantially); Studio + web-studio both functional.

---

### Phase 7 — Cleanup & docs (½ day)

- [ ] **Task 7.1:** Update `README.md` to reflect new quickstart (`bun run web`, `bun run mastra:dev`).
- [ ] **Task 7.2:** Update `docs/spec.md` and `docs/plan.md` (top-level design docs) to note the migration happened and point at this spec for rationale. Or delete them if obsolete.
- [ ] **Task 7.3:** Archive `docs/plans/web-studio-manual-test-plan.md` if superseded by a Studio-based manual test checklist.
- [ ] **Task 7.4:** Cut a changeset version bump; run `bun run ci` one final time.

---

## Verification checkpoints (summary)

| After phase | Must be true |
|---|---|
| 0 | `mastra dev` boots; `bun run ci` green |
| 1 | Mastra tools in isolation pass all tests; no regressions |
| 2 | `simpleChatAgent` runs in Studio |
| 3 | Simple-chat on Mastra via web-studio; Deep Research untouched; both work |
| 4 | Deep Research on Mastra Workflow; HITL intact |
| 5 | Traces in Langfuse; 1 eval green in Studio |
| 6 | All doomed packages/apps deleted; no dangling imports |
| 7 | Docs & README accurate; changeset cut |

## Rollback plan

Per-phase rollback is cheap because each phase is a commit series on `feat/mastra-migration`. To abort at any phase: reset the branch to its pre-phase tag (tag each phase end `mastra-phase-N`). Master is never touched until Phase 6; even after merge, `git revert` the migration commit restores the harness state in one move — the deleted packages come back via git history.

**Hard rollback limit:** once `apps/server` or `apps/web` begin their own migrations (follow-up), deletion of `@harness/core/agent` is no longer reversible without more work. Plan that crossing deliberately.

## Out of scope (explicit)

- Migrating `apps/server`, `apps/web` — future passes.
- Production deploy of `mastra build` output.
- Porting every harness eval spec — just one pilot in Phase 5.
- Mastra Auth / Okta / RBAC (new in March 2026 changelog) — not needed for this repo.
- RAG / vector-store adoption.

## Estimated total effort

~6–8 focused days if the strangler holds. Plan-approval HITL in Phase 4 is the single biggest risk — budget 1 extra day for Mastra workflow semantics that don't map 1:1.
