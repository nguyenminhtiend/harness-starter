# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this starter is

TypeScript-first, clone-and-own (no npm publish) template for agentic AI systems. Hexagonal architecture with event-sourced run execution, pluggable capabilities, and HTTP APIs. Mastra primitives (agents, workflows, tools) are building blocks composed via the `Capability<I, O>` interface.

**Tech stack:** TypeScript 5.7 strict · Bun workspaces · Mastra v1 (agents, workflows, memory) · Vercel AI SDK v5 · Zod v4 · Hono · pino · @opentelemetry/api · Biome · Lefthook · Commitlint · Changesets · LibSQL.

## Shape invariants (non-negotiable)

1. **Hexagonal architecture.** Domain and application layers have zero runtime deps beyond `zod`. All I/O lives in adapters behind port interfaces.
2. **Capability interface.** All agent/workflow access goes through `Capability<I, O>`. Mastra is one adapter (`fromMastraAgent`, `fromMastraWorkflow`), not a hard dependency of the domain.
3. **Event-sourced runs.** The `Run` aggregate emits `SessionEvent`s. All state mutation goes through `Run`. No route or adapter calls store methods directly.
4. **Mastra primitives.** Agents use `@mastra/core/agent`, tools use `@mastra/core/tools/createTool`, workflows use `@mastra/core/workflows/createWorkflow`.
5. **Structured output** uses Zod v4 schemas passed to Mastra agents/steps.
6. **Workflow-first for multi-step.** Multi-step pipelines are Mastra `createWorkflow` with typed steps, not custom graph implementations. HITL uses `suspend()`/`resume()`.
7. **`AbortSignal` flows top-down** where supported by Mastra.
8. **Clone-and-own invariant:** deleting any of `packages/tools/`, `packages/agents/`, `packages/workflows/`, `packages/capabilities/`, or any `apps/*` must leave the rest building and testing cleanly.
9. **Mastra Studio as dev UI.** `mastra dev` provides agent/workflow inspection, traces, and evals. `apps/console` is the production web UI.

## Non-goals — do not build these

- No vector DB or dedicated RAG primitives (Mastra offers it but we opt out).
- No bundled PII/jailbreak/toxicity classifiers — guardrail interfaces only.
- No circuit breakers or fallback-provider chains.
- No stateful HTTP sessions — server is pure `(conversationId, input) → stream`.
- No Python bridge or cross-language interop.
- No npm publishing.

## Architecture — hexagonal layers

```
┌──────────────────────────────────────────────────────────────┐
│ Transports       HTTP (REST + SSE via Hono)                  │
├──────────────────────────────────────────────────────────────┤
│ Application      StartRun · RunExecutor · StreamRunEvents ·  │
│ (use cases)      ApproveRun · CancelRun · ListCapabilities · │
│                  Settings · Conversations                    │
├──────────────────────────────────────────────────────────────┤
│ Domain           Run (aggregate) · SessionEvent (Zod union)  │
│                  Capability<I,O> · Conversation · Approval   │
├──────────────────────────────────────────────────────────────┤
│ Ports            RunStore · EventLog · EventBus ·            │
│ (interfaces)     ApprovalStore · MemoryProvider ·            │
│                  ProviderResolver · CapabilityRegistry ·     │
│                  Clock · IdGen · Logger · Tracer             │
├──────────────────────────────────────────────────────────────┤
│ Adapters         InMemory stores · Mastra (capabilities) ·   │
│                  pino (logger) · crypto (id) · system (clock)│
└──────────────────────────────────────────────────────────────┘
```

### Package DAG

```
packages/
  tools ──→ agents ──→ workflows       (Mastra primitives)
          ↑             ↑
          └─────────────┤
                        │
  adapters  ←── capabilities ──→ core
     ↑                           ↑
     └──────────────┐            │
                    │            │
                  http  ←────────┘
                    ↑
apps/
  api           (composition root — wires everything)
  console       (React SPA — imports only @harness/http/types)

mastra.config.ts  (Mastra Studio config via buildMastraConfig)
```

- **`packages/core/`** — Domain model, port interfaces, use cases. Zero deps outside `zod`.
- **`packages/adapters/`** — Port implementations: in-memory stores, Mastra bridge, pino, OTel stubs.
- **`packages/capabilities/`** — Capability definitions (simple-chat, deep-research) + `buildMastraConfig`.
- **`packages/http/`** — Hono routes, middleware, OpenAPI spec, public DTO types.
- **`packages/tools/`** — Mastra `createTool` implementations (calculator, get-time, fs, fetch).
- **`packages/agents/`** — Mastra `Agent` definitions (simpleChatAgent) + `mockModel` test helper.
- **`packages/workflows/`** — Mastra `createWorkflow` compositions (deepResearchWorkflow).
- **`apps/api/`** — Composition root: config → adapters → capabilities → HTTP server.
- **`apps/console/`** — React SPA (Vite + TanStack Query). Imports only `@harness/http/types`.
- **`mastra.config.ts`** — Root Mastra config using `buildMastraConfig()` from `@harness/capabilities`.

Layering is enforced by Biome `noRestrictedImports` rules in `biome.json`.

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
bun run mastra:dev   # Mastra Studio on :4111
bun run mastra:build # Mastra production build
```

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
- **No mocks of `Provider`.** Use `mockModel()` from `@harness/agents/testing` — scripted `MockLanguageModelV3` replay.
- Port fakes in `@harness/core/testing` (`FakeEventLog`, `FakeEventBus`, `FakeRunStore`, etc.) for use case tests.
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
