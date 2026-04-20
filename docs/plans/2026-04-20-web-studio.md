# Implementation Plan: web-studio

> **Spec:** `docs/specs/2026-04-20-web-studio.md`
> **Design system reference:** `sample-ui/` (Claude Design — tokens, primitives, layout)
> **Date:** 2026-04-20
> **Status:** awaiting review

## Overview

Build `apps/web-studio`, a local-first web UI for running harness-driven agent tools (Deep Research first, others later). Hono server on `localhost:3000`, React 19 + Vite 6 frontend, SSE streaming, HITL plan approval, run history, auto-rendered settings from Zod schemas. Replaces the CLI's flags with an interactive UI.

## Architecture Decisions

- **Copy, don't import** the deep-research graph factory into `src/server/tools/deep-research.ts` (clone-and-own invariant 8).
- **SSE for streaming** — each run gets a `GET /api/runs/:id/events` endpoint; events are also persisted to SQLite for replay.
- **SQLite for app state** — separate DB from the harness's `@harness/memory-sqlite` DBs. Three tables: `settings`, `runs`, `events`.
- **Design system from `sample-ui/`** — port `tokens.css` as-is, convert JSX primitives to TSX with proper types. Keep inline styles (spec says "CSS modules or inline styles, kept minimal").
- **Auto-form from Zod** — use `z.toJSONSchema()` (Zod v4 native) to render settings forms. Flat fields only in v1.
- **Custom Bun supervisor** for dev — no `concurrently` dependency.

## Won't-do (spec non-goals + spec §6 "never do")

- No auth, no multi-user, no `0.0.0.0` binding
- No vector DB / RAG
- No agent-manifest loader
- No E2E browser test suite (manual checklist in v1)
- No nested settings auto-form
- No importing from `apps/deep-research`

---

## Task List

### Phase 1: App Scaffold + Dev Tooling

#### Task 1: App structure and package.json

**Description:** Create the `apps/web-studio` directory with `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, and `CLAUDE.md`. Wire dependencies: React 19, Vite 6, Hono 4, TanStack Query, react-markdown, Zod v4. Add `"web"` script to root `package.json`.

**Acceptance criteria:**
- [ ] `apps/web-studio/package.json` exists with correct deps and scripts (`dev`, `build`, `typecheck`, `start`)
- [ ] `tsconfig.json` extends root, includes `src`
- [ ] `vite.config.ts` configures React + proxy `/api` → `:3000`
- [ ] `index.html` SPA entry exists
- [ ] Root `package.json` has `"web": "bun run --filter @harness/example-web-studio dev"`

**Verification:**
- [ ] `bun install` succeeds
- [ ] `bun run typecheck` passes (empty app)
- [ ] `bun run build` passes

**Dependencies:** None

**Files likely touched:**
- `apps/web-studio/package.json`
- `apps/web-studio/tsconfig.json`
- `apps/web-studio/vite.config.ts`
- `apps/web-studio/index.html`
- `apps/web-studio/CLAUDE.md`
- `package.json` (root — add `web` script)

**Estimated scope:** Small (4-5 files)

---

#### Task 2: Custom dev supervisor

**Description:** Create `scripts/dev.ts` — a Bun script that spawns `bun --hot src/server/index.ts` and `vite` as child processes, prefixes output with colored `[server]`/`[ui]` tags, forwards signals, exits on first non-zero code.

**Acceptance criteria:**
- [ ] `scripts/dev.ts` spawns both processes
- [ ] Output is prefixed and color-coded
- [ ] SIGINT/SIGTERM forwarded to children
- [ ] Exits with first non-zero exit code

**Verification:**
- [ ] `bun run dev` (from `apps/web-studio`) boots both processes
- [ ] Ctrl-C kills both cleanly

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web-studio/scripts/dev.ts`

**Estimated scope:** Small (1 file)

---

#### Task 3: Design system port — tokens + primitives

**Description:** Port `sample-ui/tokens.css` to `src/ui/tokens.css`. Convert `sample-ui/primitives.jsx` to `src/ui/components/primitives.tsx` with proper TypeScript types. This covers: Spinner, Button, Badge, Input, Textarea, SelectField, Toggle, Slider, Collapsible, Skeleton, Tooltip, Toast, Modal, Divider. Keep inline styles (matches spec).

**Acceptance criteria:**
- [ ] `tokens.css` imported in `main.tsx`
- [ ] All primitives exported as typed TSX components
- [ ] No `any` types
- [ ] Keyframe animations injected

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Components render in browser (manual)

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web-studio/src/ui/tokens.css`
- `apps/web-studio/src/ui/components/primitives.tsx`
- `apps/web-studio/src/ui/main.tsx`

**Estimated scope:** Medium (3 files, but primitives.tsx is dense)

---

#### Task 4: Shared types (tool contract, events, settings)

**Description:** Create `src/shared/tool.ts`, `src/shared/events.ts`, `src/shared/settings.ts` with the type contracts shared between server and UI. `ToolDef` interface per spec §3. UI event shapes as a flat JSON-serializable subset of `HarnessEvents`. Settings hierarchy types.

**Acceptance criteria:**
- [ ] `ToolDef<S>` interface with `id`, `title`, `description`, `settingsSchema`, `defaultSettings`, `buildAgent`
- [ ] UI event discriminated union (`UIEvent`) covers all phases: planner, researcher, writer, factchecker, tool, agent, metric, complete, error
- [ ] `GlobalSettings` and `ToolOverrides` types defined
- [ ] Types importable from both server and UI code

**Verification:**
- [ ] `bun run typecheck` passes

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web-studio/src/shared/tool.ts`
- `apps/web-studio/src/shared/events.ts`
- `apps/web-studio/src/shared/settings.ts`

**Estimated scope:** Small (3 files, types only)

---

#### Task 5: Server skeleton — Hono app + config

**Description:** Create the Hono server entry point at `src/server/index.ts`. Binds to `127.0.0.1:3000`. Create `src/server/config.ts` with `envConfig` for `HOST`, `PORT`, `DATA_DIR`. Mount route groups (empty stubs). Serve Vite-built static files in production.

**Acceptance criteria:**
- [ ] Server binds `127.0.0.1` only (never `0.0.0.0`)
- [ ] `GET /api/health` returns 200
- [ ] Config reads from env with defaults
- [ ] Route groups mounted at `/api/runs`, `/api/tools`, `/api/settings`

**Verification:**
- [ ] `bun run src/server/index.ts` boots
- [ ] `curl http://localhost:3000/api/health` returns 200

**Dependencies:** Task 1, Task 4

**Files likely touched:**
- `apps/web-studio/src/server/index.ts`
- `apps/web-studio/src/server/config.ts`
- `apps/web-studio/src/server/routes/runs.ts` (stub)
- `apps/web-studio/src/server/routes/tools.ts` (stub)
- `apps/web-studio/src/server/routes/settings.ts` (stub)

**Estimated scope:** Small (5 files)

---

### Checkpoint: Foundation
- [ ] `bun run web` boots both Vite and Hono servers
- [ ] `bun run typecheck` passes for web-studio
- [ ] `bun run ci` is green (web-studio included)
- [ ] Vite proxy hits Hono's `/api/health`
- [ ] **Review with human before proceeding**

---

### Phase 2: Data Layer + Tool Registry

#### Task 6: SQLite persistence layer

**Description:** Create `src/server/persistence.ts` using `bun:sqlite`. Three tables: `settings` (key TEXT PK, value JSON), `runs` (id TEXT PK, toolId, question, status, costUsd, createdAt, finishedAt), `events` (runId, seq INTEGER, ts, type, payload JSON). Provide typed CRUD functions. Separate DB file from harness's `@harness/memory-sqlite`.

**Acceptance criteria:**
- [ ] DB created at `${DATA_DIR}/web-studio.db`
- [ ] `upsertSetting / getSetting / getAllSettings` work
- [ ] `createRun / updateRun / getRun / listRuns` work
- [ ] `appendEvent / getEvents` work (ordered by seq)
- [ ] Schema auto-created on first open

**Verification:**
- [ ] `bun test apps/web-studio/src/server/persistence.test.ts` passes
- [ ] `bun run typecheck` passes

**Dependencies:** Task 5

**Files likely touched:**
- `apps/web-studio/src/server/persistence.ts`
- `apps/web-studio/src/server/persistence.test.ts`

**Estimated scope:** Medium (2 files)

---

#### Task 7: Tool registry + deep-research ToolDef

**Description:** Create `src/server/tools/registry.ts` exporting `tools: Record<string, ToolDef>`. Create `src/server/tools/deep-research.ts` — copy the graph factory from `apps/deep-research/src/graph.ts` and adapt it into a `ToolDef` with a Zod settings schema (model, depth, budgetUsd, maxTokens, concurrency, ephemeral, hitl + prompt fields). Copy supporting files: agents, schemas, budgets, guardrails, search tools. Do NOT import from `apps/deep-research`.

**Acceptance criteria:**
- [ ] `deep-research` entry in registry with valid `ToolDef`
- [ ] `settingsSchema` is a flat `z.object({...})` with all fields from the spec
- [ ] `defaultSettings` matches the CLI defaults
- [ ] `buildAgent(args)` returns a valid `Agent`
- [ ] No imports from `apps/deep-research/*`
- [ ] `GET /api/tools` route returns the registry (id, title, description, JSON schema of settings)

**Verification:**
- [ ] `bun test apps/web-studio/src/server/tools/deep-research.test.ts` — smoke test confirming `buildAgent` shape
- [ ] `bun run typecheck` passes

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `apps/web-studio/src/server/tools/registry.ts`
- `apps/web-studio/src/server/tools/deep-research.ts`
- `apps/web-studio/src/server/tools/deep-research.test.ts`
- `apps/web-studio/src/server/routes/tools.ts`
- Supporting copies: agents, schemas, budgets, guardrails, lib

**Estimated scope:** Large (many files copied + adapted — but mechanical)

---

#### Task 8: Runner — agent orchestration + SSE bus

**Description:** Create `src/server/runner.ts`. Given a `ToolDef`, settings, and a question: construct the provider, build the agent via `ToolDef.buildAgent()`, stream `AgentEvent`s, bridge them to an SSE-compatible event bus, and persist each event to SQLite. Manage `AbortController` for cancellation. Track cost/tokens via `@harness/core` `trackCost`.

**Acceptance criteria:**
- [ ] `startRun(toolId, question, settings, signal)` returns an async event iterator
- [ ] Events bridged from `Agent.stream()` → UI event format → SSE bus + SQLite
- [ ] `AbortSignal` piped from HTTP request through to `provider.stream` → `tool.execute`
- [ ] Run status updated in SQLite (running → completed/failed/cancelled)
- [ ] Cost/token totals accumulated and persisted

**Verification:**
- [ ] `bun test apps/web-studio/src/server/runner.test.ts` — unit test with `fakeProvider()`
- [ ] `bun run typecheck` passes

**Dependencies:** Task 6, Task 7

**Files likely touched:**
- `apps/web-studio/src/server/runner.ts`
- `apps/web-studio/src/server/runner.test.ts`

**Estimated scope:** Medium (2 files, complex logic)

---

### Checkpoint: Data Layer
- [ ] All tests pass: `bun test apps/web-studio/`
- [ ] `bun run typecheck` passes
- [ ] `bun run ci` is green
- [ ] **Review with human before proceeding**

---

### Phase 3: First Streaming Run (End-to-End Vertical Slice)

#### Task 9: Run API routes — create run + SSE stream

**Description:** Implement `POST /api/runs` (creates a run, starts the runner, returns `{ id, status }`) and `GET /api/runs/:id/events` (SSE endpoint that streams events as `text/event-stream`). Events are `data: JSON\n\n` formatted. Handle client disconnect → abort run.

**Acceptance criteria:**
- [ ] `POST /api/runs` accepts `{ toolId, question, settings }`, returns `{ id }`
- [ ] `GET /api/runs/:id/events` streams SSE events in real time
- [ ] Client disconnect triggers `AbortController.abort()`
- [ ] SSE includes event types: `event`, `status`, `cost`, `error`, `done`
- [ ] Route-level input validation via Zod

**Verification:**
- [ ] `bun test apps/web-studio/src/server/routes/runs.test.ts` — in-process tests via `app.request()`
- [ ] Manual: `curl -N http://localhost:3000/api/runs/:id/events` shows SSE

**Dependencies:** Task 8

**Files likely touched:**
- `apps/web-studio/src/server/routes/runs.ts`
- `apps/web-studio/src/server/routes/runs.test.ts`
- `apps/web-studio/src/server/routes/stream.ts`

**Estimated scope:** Medium (3 files)

---

#### Task 10: UI — App shell + RunForm + basic layout

**Description:** Create `src/ui/App.tsx` with the three-panel layout from `sample-ui/App.jsx`. Port `sample-ui/run-panel.jsx` to `src/ui/components/RunForm.tsx`. Create `src/ui/api.ts` typed fetch client. Wire `POST /api/runs` from the Run button. For now, sidebar is a static shell (tool picker only, no history).

**Acceptance criteria:**
- [ ] App renders with sidebar (tool picker) + center panel
- [ ] RunForm has query textarea, model select, Run/Stop buttons
- [ ] `Cmd+Enter` keyboard shortcut triggers run
- [ ] Run button calls `POST /api/runs` and gets a run ID
- [ ] API client is typed (shared types from `src/shared/`)

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: App loads in browser, form renders, Run button triggers API call

**Dependencies:** Task 3, Task 9

**Files likely touched:**
- `apps/web-studio/src/ui/App.tsx`
- `apps/web-studio/src/ui/api.ts`
- `apps/web-studio/src/ui/components/RunForm.tsx`
- `apps/web-studio/src/ui/components/ToolPicker.tsx`

**Estimated scope:** Medium (4 files)

---

#### Task 11: UI — StreamView + useEventStream hook

**Description:** Port `sample-ui/run-panel.jsx` StreamView/TimelineEvent to `src/ui/components/StreamView.tsx`. Create `src/ui/hooks/useEventStream.ts` — SSE consumer using `EventSource` or `fetch` with `ReadableStream`. Wire: after `POST /api/runs`, open SSE connection, render events in the timeline.

**Acceptance criteria:**
- [ ] `useEventStream(runId)` hook connects to SSE, returns `{ events, status, tokens, cost }`
- [ ] StreamView renders timeline with phase-colored icons, labels, timestamps
- [ ] Verbose toggle filters agent/tool/metric events
- [ ] Auto-scroll with pin/unpin
- [ ] Streaming cursor animation on active events
- [ ] Cost counter shows live tokens + USD

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: Full end-to-end — type question → Run → see events stream live

**Dependencies:** Task 9, Task 10

**Files likely touched:**
- `apps/web-studio/src/ui/components/StreamView.tsx`
- `apps/web-studio/src/ui/hooks/useEventStream.ts`

**Estimated scope:** Medium (2 files, but StreamView is complex)

---

### Checkpoint: First Streaming Run
- [ ] User can open `localhost:5173`, type a question, hit Run, and see events stream live
- [ ] Stop button cancels the run (server-side abort)
- [ ] All tests pass
- [ ] `bun run ci` is green
- [ ] **Review with human before proceeding**

---

### Phase 4: HITL Plan Approval

#### Task 12: Approve endpoint + ApprovalResolver

**Description:** Create `POST /api/runs/:id/approve` accepting `{ decision: 'approve' | 'reject', editedPlan? }`. On the server, bridge HTTP approval to the graph's `interrupt()` mechanism. The runner creates an `ApprovalResolver` that blocks until the HTTP endpoint is called. SSE emits a `hitl-required` event with the plan payload when waiting.

**Acceptance criteria:**
- [ ] `POST /api/runs/:id/approve` with `decision: 'approve'` resumes the run
- [ ] `decision: 'reject'` cancels the run
- [ ] `editedPlan` is applied before resuming (the edited plan is what's persisted)
- [ ] SSE emits `hitl-required` with the plan when waiting
- [ ] SSE emits `hitl-resolved` with the decision after approval

**Verification:**
- [ ] `bun test apps/web-studio/src/server/routes/approve.test.ts`
- [ ] Manual: Enable HITL → run pauses → approve via curl → run continues

**Dependencies:** Task 8, Task 9

**Files likely touched:**
- `apps/web-studio/src/server/routes/approve.ts`
- `apps/web-studio/src/server/routes/approve.test.ts`
- `apps/web-studio/src/server/runner.ts` (add ApprovalResolver)

**Estimated scope:** Medium (3 files)

---

#### Task 13: PlanApprovalModal component

**Description:** Port `sample-ui/modals.jsx` HitlModal to `src/ui/components/PlanApprovalModal.tsx`. Wire to the SSE `hitl-required` event. Three actions: Approve, Reject, Edit-and-approve. Edit mode allows modifying subquestions and search queries inline. Calls `POST /api/runs/:id/approve`.

**Acceptance criteria:**
- [ ] Modal opens automatically when `hitl-required` event received
- [ ] Preview mode shows plan read-only
- [ ] Edit mode allows inline editing of subquestions + queries
- [ ] Approve calls API with `decision: 'approve'`
- [ ] Reject calls API with `decision: 'reject'`, shows toast
- [ ] Edit-and-approve sends the modified plan
- [ ] Escape closes modal (rejects)

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: Full HITL flow — enable HITL in settings → run → modal appears → approve → run continues

**Dependencies:** Task 11, Task 12

**Files likely touched:**
- `apps/web-studio/src/ui/components/PlanApprovalModal.tsx`
- `apps/web-studio/src/ui/App.tsx` (wire modal)

**Estimated scope:** Medium (2 files)

---

### Phase 5: Run History + Resume

#### Task 14: History API routes

**Description:** Implement `GET /api/runs` (list past runs with filtering/search) and `GET /api/runs/:id` (single run with metadata). Add query params: `?status=completed`, `?q=search+term`, `?limit=50`. Events replay via existing `GET /api/runs/:id/events` which, for finished runs, replays from SQLite.

**Acceptance criteria:**
- [ ] `GET /api/runs` returns `{ runs: Run[] }` sorted by `createdAt` desc
- [ ] Supports `?status`, `?q`, `?limit` filters
- [ ] `GET /api/runs/:id` returns full run metadata
- [ ] SSE endpoint for finished runs replays events from SQLite (then closes)
- [ ] Resume: `POST /api/runs` with `{ resumeRunId }` continues from checkpoint

**Verification:**
- [ ] `bun test apps/web-studio/src/server/routes/runs.test.ts` (extended)
- [ ] Manual: Create run → finish → GET /api/runs shows it

**Dependencies:** Task 6, Task 9

**Files likely touched:**
- `apps/web-studio/src/server/routes/runs.ts` (extend)

**Estimated scope:** Small (1 file extended)

---

#### Task 15: HistorySidebar component

**Description:** Port `sample-ui/sidebar.jsx` Sidebar to `src/ui/components/HistorySidebar.tsx`. Use TanStack Query to fetch `GET /api/runs`. Search input filters client-side (+ debounced server refetch). Status filter pills. Run cards show tool icon, query preview, status dot, cost, relative time. Click → select run → replay events.

**Acceptance criteria:**
- [ ] Sidebar shows tool picker at top, history below
- [ ] Search input filters runs
- [ ] Status filter pills (all/running/completed/failed/cancelled)
- [ ] Clicking a run loads its events via SSE replay
- [ ] Active run highlighted
- [ ] "New run" resets the center panel
- [ ] Resume button on incomplete runs

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: Complete multiple runs → see in sidebar → click to replay

**Dependencies:** Task 10, Task 14

**Files likely touched:**
- `apps/web-studio/src/ui/components/HistorySidebar.tsx`
- `apps/web-studio/src/ui/App.tsx` (wire sidebar)

**Estimated scope:** Medium (2 files)

---

### Checkpoint: History + HITL
- [ ] Full run lifecycle works: create → stream → complete → view in history
- [ ] HITL approval flow works: pause → modal → approve/reject/edit → continue
- [ ] Resume works: incomplete run → click → continue from checkpoint
- [ ] All tests pass
- [ ] `bun run ci` is green
- [ ] **Review with human before proceeding**

---

### Phase 6: Settings

#### Task 16: Settings API routes + persistence

**Description:** Implement `GET /api/settings` (returns global + per-tool settings) and `PUT /api/settings` (upsert global or per-tool). Settings stored in SQLite `settings` table keyed by `global` or `<toolId>`. Merge logic: tool-level overrides win over global defaults.

**Acceptance criteria:**
- [ ] `GET /api/settings` returns `{ global: GlobalSettings, tools: Record<ToolId, ToolOverrides> }`
- [ ] `PUT /api/settings` with `{ scope: 'global' | toolId, settings }` persists
- [ ] Merge at read-time: tool values override global
- [ ] Prompts stored as `<toolId>.prompts.<role>` keys
- [ ] API keys are NEVER returned to the client (only `{ set: boolean }`)

**Verification:**
- [ ] `bun test apps/web-studio/src/server/routes/settings.test.ts`
- [ ] Manual: PUT settings → GET → see merged values

**Dependencies:** Task 6

**Files likely touched:**
- `apps/web-studio/src/server/routes/settings.ts`
- `apps/web-studio/src/server/routes/settings.test.ts`

**Estimated scope:** Small (2 files)

---

#### Task 17: SettingsPanel + auto-form rendering

**Description:** Port `sample-ui/settings.jsx` to `src/ui/components/SettingsPanel.tsx`. Auto-render form fields from `z.toJSONSchema(toolDef.settingsSchema)`. Four tabs: Tool, Prompts, API Keys, Global. Create `src/ui/hooks/useSettings.ts` with TanStack Query for GET/PUT.

**Acceptance criteria:**
- [ ] Tool tab auto-renders from Zod JSON schema (selects, sliders, toggles, inputs)
- [ ] Fields show "inherited" badge when using global default
- [ ] Prompts tab shows editable textareas with "Restore default" buttons
- [ ] API Keys tab shows masked status only (`set`/`not set`) — never actual keys
- [ ] Global tab shows default model, token cap, budget, concurrency
- [ ] Changes auto-save (debounced PUT)
- [ ] "Saved" pill animation on save

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: Change settings → refresh → settings persisted

**Dependencies:** Task 7, Task 10, Task 16

**Files likely touched:**
- `apps/web-studio/src/ui/components/SettingsPanel.tsx`
- `apps/web-studio/src/ui/hooks/useSettings.ts`
- `apps/web-studio/src/ui/App.tsx` (wire settings view)

**Estimated scope:** Medium (3 files)

---

#### Task 18: Settings hierarchy in runner

**Description:** When `POST /api/runs` creates a run, the runner merges settings: `defaultSettings` ← `globalSettings` ← `toolOverrides` ← `request.settings`. This merged config is what `buildAgent()` receives. Prompts merge the same way.

**Acceptance criteria:**
- [ ] Runner reads global + tool settings from persistence before building agent
- [ ] Per-tool overrides win over global
- [ ] Request-level overrides win over per-tool
- [ ] Prompts flow through to agent system messages
- [ ] User question wrapped in `<user_question>` delimiters

**Verification:**
- [ ] `bun test apps/web-studio/src/server/runner.test.ts` (extended)
- [ ] Manual: Set global model → override per-tool → run uses per-tool model

**Dependencies:** Task 8, Task 16

**Files likely touched:**
- `apps/web-studio/src/server/runner.ts` (extend)

**Estimated scope:** Small (1 file extended)

---

### Checkpoint: Settings
- [ ] Settings persist across restarts
- [ ] Hierarchy works: global → tool override → request override
- [ ] Prompt editing works with restore-to-defaults
- [ ] API keys never exposed to browser
- [ ] All tests pass
- [ ] `bun run ci` is green
- [ ] **Review with human before proceeding**

---

### Phase 7: Report View + Polish

#### Task 19: ReportView component

**Description:** Port `sample-ui/modals.jsx` ReportView to `src/ui/components/ReportView.tsx`. Render final report as markdown (use `react-markdown`). Copy-to-clipboard and download-as-markdown buttons. View switcher in the top bar toggles between Stream and Report views.

**Acceptance criteria:**
- [ ] Report renders as formatted markdown (headings, tables, code, blockquotes, lists)
- [ ] "Copy MD" copies raw markdown to clipboard
- [ ] "Download" saves as `.md` file
- [ ] View switcher shows Stream/Report toggle for completed runs
- [ ] Report fetched from server (from run's final state)

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: Complete a run → switch to Report → see formatted output

**Dependencies:** Task 11, Task 14

**Files likely touched:**
- `apps/web-studio/src/ui/components/ReportView.tsx`
- `apps/web-studio/src/ui/App.tsx` (wire view switcher)

**Estimated scope:** Small (2 files)

---

#### Task 20: Error handling, abort/cancel, toasts

**Description:** Wire abort/cancel throughout: Stop button → `POST /api/runs/:id/cancel` → `AbortController.abort()` → SSE emits `error` event → UI shows cancelled status. Toast notifications for: run started, run completed, run cancelled, run failed, plan rejected, settings saved. Handle SSE reconnection on network drop.

**Acceptance criteria:**
- [ ] Stop button cancels running run
- [ ] Server-side errors (budget exceeded, provider error) surface as typed SSE events
- [ ] Toast notifications for key actions
- [ ] Keyboard shortcuts: `Cmd+Enter` (run), `Escape` (close modals)
- [ ] SSE consumer handles connection drops gracefully (reconnect or show error)
- [ ] All error states render in UI (failed badge, error events in timeline)

**Verification:**
- [ ] `bun run typecheck` passes
- [ ] Manual: Cancel a run → see cancelled status + toast

**Dependencies:** Task 11, Task 13

**Files likely touched:**
- `apps/web-studio/src/server/routes/runs.ts` (cancel endpoint)
- `apps/web-studio/src/ui/hooks/useEventStream.ts` (error handling)
- `apps/web-studio/src/ui/App.tsx` (toasts, keyboard shortcuts)

**Estimated scope:** Small (3 files, incremental changes)

---

#### Task 21: Server unit tests + smoke tests

**Description:** Add comprehensive server tests: tool registry, settings persistence, SSE bus bridging, route handlers (via Hono `app.request()`). Smoke test that `deep-research` ToolDef's `buildAgent` returns a valid Agent. No mocks of `Provider` — use `fakeProvider()`.

**Acceptance criteria:**
- [ ] Persistence layer: CRUD operations tested
- [ ] Routes: each endpoint has at least one happy-path and one error-path test
- [ ] Tool registry: deep-research entry validates against `ToolDef` shape
- [ ] Runner: event bridging tested with `fakeProvider()`
- [ ] No mocks of `Provider`

**Verification:**
- [ ] `bun test apps/web-studio/` — all pass
- [ ] `bun run ci` is green

**Dependencies:** Task 6, Task 7, Task 8, Task 9, Task 12, Task 16

**Files likely touched:**
- Various `*.test.ts` files (extending existing + new)

**Estimated scope:** Medium (5+ test files)

---

#### Task 22: MANUAL_TEST_PLAN.md + final CI integration

**Description:** Create `apps/web-studio/MANUAL_TEST_PLAN.md` — port from `apps/deep-research/MANUAL_TEST_PLAN.md` with web-specific additions. Verify `bun run ci` includes web-studio (typecheck, build, test). Verify clone-and-own: deleting `apps/web-studio` leaves repo building.

**Acceptance criteria:**
- [ ] `MANUAL_TEST_PLAN.md` covers all spec acceptance criteria (§1.1–1.9)
- [ ] `bun run ci` green with web-studio included
- [ ] Deleting `apps/web-studio` → `bun run ci` still passes (clone-and-own)
- [ ] `bun run web` documented in root README

**Verification:**
- [ ] `bun run ci` passes
- [ ] Delete `apps/web-studio`, `bun run ci` still passes, then restore

**Dependencies:** All previous tasks

**Files likely touched:**
- `apps/web-studio/MANUAL_TEST_PLAN.md`
- `README.md` (add web command)

**Estimated scope:** Small (2 files)

---

### Checkpoint: Complete
- [ ] All spec acceptance criteria (§1.1–1.9) met
- [ ] Feature parity with CLI: depth, budget, model, ephemeral, HITL, output dir, resume
- [ ] Settings hierarchy: global → per-tool, persisted to SQLite
- [ ] Prompt editing: per-tool, restorable to defaults
- [ ] Live streaming: SSE with all phases, cancellable
- [ ] HITL modal: approve / reject / edit-and-approve
- [ ] Run history: sidebar, replay, resume
- [ ] Tool extensibility: new tool = one file in registry
- [ ] `bun run web` boots server + Vite
- [ ] `bun run ci` is green
- [ ] Clone-and-own verified
- [ ] **Ready for review**

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Deep-research graph copy diverges from original | Med | Keep a comment referencing the source commit; this is intentional per clone-and-own invariant |
| SSE backpressure under heavy tool-call events | Low | Persist events to SQLite first, replay from DB for history; SSE is fire-and-forget |
| `z.toJSONSchema()` output may not cover all widget hints | Med | Fall back to string input for unrecognized types; use `.meta({ widget })` for textarea |
| Vite + Hono proxy issues in dev | Low | Proxy is well-tested pattern; fallback to separate ports if needed |
| TanStack Query cache staleness for settings | Low | Invalidate on PUT; auto-save is debounced |
| `bun --hot` instability for server restarts | Low | Dev supervisor can fall back to manual restart on crash |

## Open Questions

- Should the web app expose MCP tool configuration in settings UI, or defer to v2? (Recommend: defer — MCP config is complex and the CLI handles it via env vars today)
- Should we add a "dark/light mode" toggle, or keep dark-only? (Recommend: dark-only in v1, matches the design system)

## Parallelization Opportunities

These tasks can run in parallel if multiple agents are available:

- **Tasks 3, 4, 5** — primitives, shared types, server skeleton are independent
- **Tasks 10, 11** — RunForm and StreamView can be built in parallel once APIs exist
- **Tasks 14, 16** — History API and Settings API are independent
- **Tasks 15, 17** — HistorySidebar and SettingsPanel are independent UI work

Sequential constraints:
- Task 7 (tool registry) → Task 8 (runner) → Task 9 (run routes) — hard dependency chain
- Task 12 (approve endpoint) → Task 13 (modal) — modal needs the API
- All Phase 7 tasks need Phases 1-6 complete
