---
date: 2026-04-20
status: draft
supersedes: apps/deep-research (CLI) — kept as reference until web parity, then deleted
---

# web-studio — local web UI for harness-driven agent tools

## 1. Objective

Replace the `deep-research` CLI with a **local-first web UI** that gives the user fine-grained control over every knob the harness exposes — model, depth, budgets, search providers, prompts, HITL — without memorising flags. The UI is a **multi-tool platform**: Deep Research is the first tool; future tools (Deep Search, Summarizer, code-assistants, anything non-research) plug in as siblings under a left-side picker, each with its own settings panel that inherits from a global scope.

The name is intentionally **not** research-specific because future tools may have nothing to do with research.

**Single user, single machine, no auth, no internet exposure.** Browser talks to a Hono server on `localhost`; agents run in the Bun process.

**Success looks like:** the user opens `localhost:3000`, picks "Deep Research", tweaks settings inline, hits Run, watches the planner → researchers → writer pipeline stream live, approves (or edits-and-approves) the plan in a modal, and ends with a saved markdown report — all without ever touching a terminal flag.

### Target user
- Repo owner running locally. Comfortable with TS, but doesn't want to memorise CLI flags every time.

### Acceptance criteria
1. Feature parity with the current CLI: depth, budget USD/tokens, model override, ephemeral mode, HITL plan approval, output dir, Brave key, Langfuse keys, MCP toggles, resume by `runId`.
2. **Settings hierarchy:** every setting has a *global* default and an optional *per-tool override*. UI shows both; tool override wins.
3. **Prompt editing:** planner / researcher / writer / fact-checker system prompts are editable per-tool from the UI, persisted to SQLite, restorable to defaults.
4. **Live streaming:** SSE feed shows planner thoughts → researcher tool calls (with args + result snippets) → writer drafting tokens → fact-checker verdict, in real time. Cancellable via a "Stop" button (server-side `AbortController`).
5. **HITL approval modal:** when HITL is enabled, the stream pauses on the plan; modal shows subquestions + queries with three actions — **Approve**, **Reject**, **Edit-and-approve** (user mutates the plan before researchers run; the edited plan is the one that's persisted to the checkpoint).
6. **Run history sidebar:** server-side SQLite lists past runs (id, tool, question, status, cost, started/finished). Click → reopens the run with full event log + final report. Resume button continues an unfinished run via the existing `Checkpointer`.
7. **Tool extensibility:** adding a new tool requires only (a) a new entry in a `tools` registry on the server, (b) a Zod settings schema, (c) a graph factory. Frontend auto-renders the settings form from the schema.
8. `bun run web` boots server + Vite dev server with HMR. `bun run ci` is green.
9. **Migration gate:** `apps/deep-research` is **not deleted** until the web app passes the manual checklist in `apps/deep-research/MANUAL_TEST_PLAN.md` end-to-end.

---

## 2. Commands

Add to root `package.json`:

```jsonc
{
  "scripts": {
    "web": "bun run --filter @harness/example-web-studio dev"
  }
}
```

In `apps/web-studio/package.json`:

```jsonc
{
  "scripts": {
    "dev": "bun run scripts/dev.ts",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "start": "bun run src/server/index.ts"
  }
}
```

`scripts/dev.ts` is a custom Bun supervisor (not `concurrently`):
- spawns `bun --hot src/server/index.ts` and `vite` as child processes
- prefixes each line of output with a coloured `[server]` / `[ui]` tag
- forwards SIGINT / SIGTERM to both children
- exits with the first non-zero exit code

Repo-wide `bun run ci` (lint + typecheck + build + test) must include this app once added.

---

## 3. Project structure

```
apps/web-studio/
├── package.json
├── tsconfig.json              # extends root, includes "src" + "ui"
├── vite.config.ts             # Vite + React, proxy /api → :3000
├── index.html                 # SPA entry
├── CLAUDE.md                  # app-scoped guidance
├── scripts/
│   └── dev.ts                 # custom Bun supervisor for server + vite
├── src/
│   ├── server/
│   │   ├── index.ts           # Hono app, SSE endpoints, static
│   │   ├── routes/
│   │   │   ├── runs.ts        # POST /api/runs, GET /api/runs, GET /api/runs/:id
│   │   │   ├── stream.ts      # GET /api/runs/:id/events  (SSE)
│   │   │   ├── approve.ts     # POST /api/runs/:id/approve  { decision, editedPlan? }
│   │   │   ├── tools.ts       # GET /api/tools  → registry
│   │   │   └── settings.ts    # GET/PUT /api/settings (global + per-tool)
│   │   ├── tools/             # tool registry — one file per tool
│   │   │   ├── registry.ts    # exports `tools: Record<ToolId, ToolDef>`
│   │   │   └── deep-research.ts  # adapts deep-research graph (copied, not imported) to ToolDef
│   │   ├── runner.ts          # orchestrates: build agent → stream → bridge events to SSE bus
│   │   ├── persistence.ts     # SQLite for settings, runs, events (separate from harness Store)
│   │   └── config.ts          # envConfig — host, port, DATA_DIR
│   └── ui/
│       ├── main.tsx           # React entry
│       ├── App.tsx
│       ├── components/
│       │   ├── ToolPicker.tsx
│       │   ├── SettingsPanel.tsx     # auto-renders from Zod schema
│       │   ├── RunForm.tsx
│       │   ├── StreamView.tsx        # event timeline
│       │   ├── PlanApprovalModal.tsx # Approve / Reject / Edit-and-approve
│       │   ├── HistorySidebar.tsx
│       │   └── ReportView.tsx        # markdown render
│       ├── hooks/
│       │   ├── useEventStream.ts     # SSE consumer
│       │   └── useSettings.ts
│       └── api.ts                    # typed fetch client (shared types from src/shared/)
└── src/shared/                 # types shared between server + UI
    ├── tool.ts                 # ToolDef, ToolId, settings-schema contracts
    ├── events.ts               # UI-level event shapes (subset of HarnessEvents)
    └── settings.ts             # GlobalSettings + per-tool override types
```

Co-located tests next to source (`*.test.ts`) per repo convention.

### Data layer
- One SQLite file at `${DATA_DIR}/web-studio.db` with three tables: `settings` (key/value JSON), `runs` (id, toolId, question, status, costUsd, createdAt, finishedAt), `events` (runId, seq, ts, type, payload JSON).
- Harness `Checkpointer` + `ConversationStore` continue to use `@harness/memory-sqlite` against the same DATA_DIR (separate DB file the harness manages).

### Tool contract (shared)

```ts
// src/shared/tool.ts
export interface ToolDef<S extends z.ZodType = z.ZodType> {
  id: string;                      // e.g. 'deep-research'
  title: string;
  description: string;
  settingsSchema: S;               // Zod schema → auto-rendered form
  defaultSettings: z.infer<S>;
  buildAgent(args: BuildAgentArgs<z.infer<S>>): Agent;  // server-only
}
```

Per spec invariant 8 (clone-and-own): the web app must build cleanly even if `apps/deep-research` is later deleted — it imports the harness packages directly, not the deep-research app. The deep-research **graph factory** is **copied** into `src/server/tools/deep-research.ts`, not imported across apps.

### Settings auto-form scope (v1)
- **Flat fields only.** Each tool's `settingsSchema` is a `z.object({...})` whose top-level fields are primitives, enums, or `z.string()` (used for prompts via a `.meta({ widget: 'textarea' })` hint). No nested objects, no per-subagent split in v1.
- Nested concerns (e.g. per-subagent budgets) are exposed as flat fields like `plannerBudgetUsd`, `writerBudgetUsd` if needed — easier to render and good enough until a real use case demands hierarchy.

---

## 4. Code style

Inherits all root `CLAUDE.md` rules. App-specific:

- **Stack:** React 19, Vite 6, Hono 4, Zod v4, TanStack Query for server state, `react-markdown` for report render, no other UI framework. No CSS framework — use CSS modules or inline styles, kept minimal.
- **No `any`, no `!`** (Biome rules from root).
- **`console.*` allowed** only inside `apps/*` per root `CLAUDE.md` — same here. UI uses `console.error` for unexpected SSE drops.
- **Server uses Bun-native APIs** (`Bun.serve` via Hono, `bun:sqlite`). `@harness/core` boundary stays Web-only.
- **Shared types live in `src/shared/`** and are imported by both server and UI; no runtime code there beyond Zod schemas.
- **SSE event payloads are flat JSON-serialisable subsets of `HarnessEvents`** — never ship internal `RunState` or full message arrays to the browser.
- **Auto-rendered settings forms** read JSON-Schema-shaped metadata from `z.toJSONSchema(schema)` (Zod v4 native). No hand-written form per tool.
- **Prompts are stored as plain strings** in the `settings` table keyed by `<toolId>.prompts.<role>`; defaults live next to the graph factory.

### Security (local-only but still)
- Hono server binds **`127.0.0.1` only**, never `0.0.0.0`.
- CORS off — same-origin only via Vite proxy in dev, served from same origin in prod.
- Brave / Langfuse / OpenRouter API keys stay in `.env`, never sent to the browser. UI shows masked status (`set` / `not set`) only.
- User question continues to be wrapped in `<user_question>…</user_question>` delimiters in prompts (per `apps/deep-research/CLAUDE.md` safety rail).
- `fetchTool` allowlists remain HTTPS-only.

---

## 5. Testing strategy

Per root policy, `apps/*` is pragmatic / tests-after — not TDD.

- **Server unit tests** (colocated `*.test.ts`): tool registry, settings persistence, SSE bus bridging, route handlers (use Hono's `app.request()` for in-process testing).
- **Graph behaviour** is already covered by tests inside `apps/deep-research`; the copy in `src/server/tools/deep-research.ts` gets a single smoke test confirming the `ToolDef.buildAgent` shape.
- **No browser/E2E suite in v1.** Manual checklist instead — port `apps/deep-research/MANUAL_TEST_PLAN.md` to `apps/web-studio/MANUAL_TEST_PLAN.md` and tick it before deletion of the CLI app.
- **No mocks of `Provider`** — use `fakeProvider()` from `@harness/core/testing` (root rule).
- Live tests gated behind `HARNESS_LIVE=1`.

---

## 6. Boundaries

### Always do
- Bind server to `127.0.0.1`.
- Treat per-tool settings as overrides over global; merge at run-construction time only.
- Pipe `AbortSignal` from HTTP request through to provider + tools (`run → provider.stream → tool.execute` invariant).
- Persist every SSE event to the `events` table so history view is a replay, not a live-only view.
- Wrap user input in `<user_question>` delimiters in prompts.
- Run `bun run ci` after every change.

### Ask first
- Adding a non-Hono / non-React dependency.
- Touching anything inside `packages/*` to make this app work — the app should consume harness packages as-is.
- Deleting `apps/deep-research` — gated on the migration acceptance (criterion 9).
- Exposing the server beyond `127.0.0.1`, adding auth, or adding any multi-user concept.
- Adding a code-execution tool, shell tool, or any tool that escapes the current `fetchTool` allowlist model.
- Promoting v1's flat settings auto-form to nested rendering (only when a real tool needs it).

### Never do
- Ship API keys (OpenRouter, Brave, Langfuse) to the browser.
- Bypass the `Checkpointer` to mutate run state from the UI.
- Add a vector DB, RAG primitive, or agent-manifest loader (root non-goals).
- Use `--no-verify` to skip Lefthook hooks.
- Mock `Provider` in tests.
- Introduce a second linter/formatter (Biome only).
- Import `apps/deep-research/*` from `apps/web-studio/*` — copy the graph factory into the new app instead (clone-and-own invariant 8).

---

## Resolved decisions (recorded for /plan)

| # | Question | Decision |
|---|----------|----------|
| — | App name | `web-studio` (research-agnostic) |
| 1 | Auto-form scope | Flat fields only in v1; nested deferred until a real tool needs it |
| 2 | Plan modal actions | Approve / Reject / Edit-and-approve |
| 3 | Streaming transport | SSE |
| 4 | Dev runner | Custom Bun supervisor at `scripts/dev.ts` (no `concurrently` dep) |
