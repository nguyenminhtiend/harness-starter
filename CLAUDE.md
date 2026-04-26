# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this starter is

TypeScript-first, clone-and-own (no npm publish) template for agentic AI systems. Feature-folder architecture with event-sourced run execution, pluggable capabilities, and HTTP APIs. Mastra primitives (agents, workflows, tools) are building blocks composed via `CapabilityDefinition` records.

**Tech stack:** TypeScript 5.7 strict · Bun workspaces · Mastra v1 (agents, workflows, memory) · Vercel AI SDK v5 · Zod v4 · Hono · pino · @opentelemetry/api · Biome · Lefthook · Commitlint · Changesets · LibSQL.

## Shape invariants (non-negotiable)

1. **Event-sourced runs.** The `Run` aggregate emits `SessionEvent`s. All run-state mutation flows through `Run`. No route calls store methods directly.
2. **Capability definitions are data.** A capability is a `CapabilityDefinition` (metadata + runner). No runtime-swap abstraction.
3. **Storage implementations are classes.** Structural types at the top of the file, not a separate `ports/` directory. Swap in-memory → Postgres by adding another class and choosing at wire time.
4. **Test seams live on `Clock` and `IdGen` (plus scripted `mockModel()`).** No general port-fake harness.
5. **Mastra primitives.** Agents use `@mastra/core/agent`, tools use `@mastra/core/tools/createTool`, workflows use `@mastra/core/workflows/createWorkflow`.
6. **Structured output** uses Zod v4 schemas passed to Mastra agents/steps.
7. **Workflow-first for multi-step.** Multi-step pipelines are Mastra `createWorkflow` with typed steps, not custom graph implementations. HITL uses `suspend()`/`resume()`.
8. **`AbortSignal` flows top-down** where supported by Mastra.
9. **Clone-and-own invariant:** deleting `packages/mastra/` must leave `core` + `http` + `bootstrap` building and testing cleanly. Deleting any `apps/*` must leave the rest building.
10. **Mastra Studio as dev UI.** `mastra dev` provides agent/workflow inspection, traces, and evals. `apps/console` is the production web UI.

## Non-goals — do not build these

- No vector DB or dedicated RAG primitives (Mastra offers it but we opt out).
- No bundled PII/jailbreak/toxicity classifiers — guardrail interfaces only.
- No circuit breakers or fallback-provider chains.
- No stateful HTTP sessions — server is pure `(conversationId, input) → stream`.
- No Python bridge or cross-language interop.
- No npm publishing.

## Architecture — feature folders

```
┌──────────────────────────────────────────────────────────────┐
│ Transports       HTTP (REST + SSE via Hono)                  │
├──────────────────────────────────────────────────────────────┤
│ Features         runs/ · conversations/ · settings/ ·        │
│ (use cases)      capabilities/                               │
├──────────────────────────────────────────────────────────────┤
│ Domain           Run (aggregate) · SessionEvent (Zod union)  │
│                  CapabilityDefinition · Conversation · Approval│
├──────────────────────────────────────────────────────────────┤
│ Infrastructure   storage/ · providers/ · observability/ ·    │
│                  time/ · memory/ · runtime/                   │
└──────────────────────────────────────────────────────────────┘
```

Studio composition is an app (`apps/studio`), mirroring `apps/api`: both consume `@harness/mastra` factories and build their own `Mastra` instance.

### Package DAG

```
mastra ─→ core ─→ http
             ↑
bootstrap ───┘
    ↑
apps/api ─→ http
apps/cli
apps/console (http types only)
apps/studio (mastra only — no core/http/bootstrap)
```

- **`packages/core/`** — Domain model, feature folders (runs, conversations, settings, capabilities), storage, providers, observability, time, memory, runtime. Deps: `zod`, `@mastra/core`, `@mastra/libsql`, `pino`, `ollama-ai-provider-v2`.
- **`packages/mastra/`** — Mastra primitives consolidated into one package:
  - `src/tools/` — `createTool` implementations (calculator, get-time, fs, fetch).
  - `src/agents/` — `Agent` definitions (simpleChatAgent) + `mockModel` test helper (`@harness/mastra/testing`).
  - `src/workflows/` — `createWorkflow` compositions (deepResearchWorkflow) + `loggedStep` helper.
  - `src/capabilities/` — `CapabilityDefinition` exports (simple-chat, deep-research) + `createCapabilityRegistry` (`@harness/mastra/capabilities`).
- **`packages/http/`** — Hono routes, middleware, auto-generated OpenAPI spec (via `hono-zod-openapi`), public DTO types.
- **`packages/bootstrap/`** — `composeHarness()` wires stores, executor, and capability registry. Shared by `apps/api` and `apps/cli`.
- **`apps/api/`** — HTTP composition root: `composeHarness()` → `createHttpApp()` (~14 LOC).
- **`apps/cli/`** — Minimal CLI: `composeHarness()` → `startRun()` → JSON-lines to stdout. Proves layering without HTTP.
- **`apps/console/`** — React SPA (Vite + TanStack Query). Imports only `@harness/http/types`.
- **`apps/studio/`** — Mastra Studio + Editor host. Composition lives at `apps/studio/src/mastra/index.ts` (Mastra CLI auto-discovery). Sibling of `apps/api`; both consume `@harness/mastra` factories and build their own `Mastra` instance. Depends only on `@harness/mastra` (no `core`/`http`/`bootstrap`).

Module boundaries enforced by Biome `noRestrictedImports` rules in `biome.json`.

## Commands

```bash
bun install
bun run ci           # lint + typecheck + build + test
bun run lint         # biome check .
bun run format       # biome format --write .
bun run typecheck    # across all workspaces
bun run build        # across all workspaces (tsc --noEmit)
bun test             # all unit tests
bun test path/to/file.test.ts  # single test

bun run web          # api + console in parallel
bun run api          # @harness/example-api (Hono backend on :3000)
bun run console      # @harness/example-console (Vite dev server on :5173)
bun run studio:dev   # Mastra Studio on :4111 — proxies into apps/studio (entry: apps/studio/src/mastra/index.ts)
bun run studio:build # Mastra production build (apps/studio)
```

Editor lives inside Studio (Agents tab → an agent → Editor tab) and shares the LibSQL DB at `apps/studio/.mastra/mastra.db`. Mastra CLI auto-discovers the entry only when run from the workspace, which is why root `studio:*` scripts shell in via `bun run --filter @harness/studio`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Start a new run |
| `GET` | `/runs/:id` | Get run status |
| `POST` | `/runs/:id/cancel` | Cancel a run |
| `DELETE` | `/runs/:id` | Delete a run |
| `GET` | `/runs/:id/events` | SSE stream of `SessionEvent`s |
| `POST` | `/runs/:id/approve` | Approve pending HITL decision |
| `POST` | `/runs/:id/reject` | Reject pending HITL decision |
| `GET` | `/capabilities` | List available capabilities |
| `GET` | `/capabilities/:id` | Capability detail + schemas |
| `GET` | `/settings` | Get settings |
| `PUT` | `/settings` | Update settings |
| `GET` | `/conversations` | List conversations |
| `GET` | `/conversations/:id/messages` | Get conversation messages |
| `DELETE` | `/conversations/:id` | Delete conversation + runs |
| `GET` | `/models` | List available models |
| `GET` | `/health` | Health check |
| `GET` | `/openapi.json` | OpenAPI 3.1 spec |
| `GET` | `/docs` | Scalar API docs |

## Testing

- Unit tests colocated: `foo.ts` + `foo.test.ts`.
- **TDD enforced for `packages/*`**. Pragmatic / tests-after for `apps/*`.
- **No mocks of `Provider`.** Use `mockModel()` from `@harness/mastra/testing` — scripted `MockLanguageModelV3` replay.
- Tests use real in-memory stores from `@harness/core` (storage module). Only `FakeClock` and `FakeIdGen` in `@harness/core/testing` for timing-dependent tests.
- Live-provider tests gated behind `HARNESS_LIVE=1`.

## CI

GitHub Actions (`.github/workflows/ci.yml`): checkout → Bun (latest) + Node 22 → `bun install --frozen-lockfile` → lint → typecheck → build → test.

**You must run `bun run ci` after every change and fix all errors before considering work complete.** Do not suppress with `// biome-ignore` unless there is genuinely no alternative and you add a justifying comment.

### Biome rules that LLMs commonly violate

All enforced in `biome.json`. Memorise these:

- **No `!` non-null assertions.** Use `?.`, `??`, or narrow with `if`. When `?.` makes a value `T | undefined` but the call-site needs `T`, use conditional spread (`...(x && { key: x })`) or an `if` guard — never reintroduce `!`.
- **No unused imports.** Remove leftovers after refactoring.
- **`import type` for type-only imports.**
- **`node:` protocol** for Node built-ins (`'node:fs'`, not `'fs'`).
- **Block statements always.** Braces required for `if`/`else`/`for`/`while` — even single-line bodies. `if (x) return y;` → `if (x) { return y; }`.
- **No `any`.** Use `unknown` and narrow.
- **No unused variables.** Prefix intentionally-unused callback params with `_`.
- **No `console.*` in `packages/*`.** Use Mastra's logger or built-in telemetry. (`console` is allowed in `apps/*` and test files.)
- **Formatting:** 2-space indent, single quotes, trailing commas, semicolons, LF, 100-char width, arrow parens always.

## Repository conventions

- **Conventional Commits** enforced by Commitlint + Lefthook `commit-msg`.
- **Changesets** manage CHANGELOG entries (no npm publishing).
- **Lefthook** pre-commit: Biome check + typecheck on staged files.
- **Biome** is the only linter/formatter — no ESLint, no Prettier.
- **`bunfig.toml`**: `exact = true` for lockfile determinism.
- **Docs:** `docs/plan.md` (platform redesign plan).
