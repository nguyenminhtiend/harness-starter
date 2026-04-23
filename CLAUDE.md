# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this starter is

TypeScript-first, clone-and-own (no npm publish) template for agentic AI systems. Layered modular monorepo on Bun workspaces, powered by Mastra framework.

**Tech stack:** TypeScript 5.7 strict · Bun workspaces · Mastra v1 (agents, workflows, memory) · Vercel AI SDK v5 · Zod v4 · Biome · Lefthook · Commitlint · Changesets · Hono · `bun:sqlite` · LibSQL.

## Shape invariants (non-negotiable)

1. **Mastra primitives.** Agents use `@mastra/core/agent`, tools use `@mastra/core/tools/createTool`, workflows use `@mastra/core/workflows/createWorkflow`.
2. **Structured output** uses Zod v4 schemas passed to Mastra agents/steps.
3. **Workflow-first for multi-step.** Multi-step pipelines are Mastra `createWorkflow` with typed steps, not custom graph implementations. HITL uses `suspend()`/`resume()`.
4. **`AbortSignal` flows top-down** where supported by Mastra.
5. **Clone-and-own invariant:** deleting any of `packages/tools/`, `packages/agents/`, `packages/workflows/`, `packages/mcp/`, `packages/memory-sqlite/`, `packages/llm-adapter/`, `packages/session-store/`, `packages/session-events/`, `packages/hitl/`, or any `apps/*` must leave the rest building and testing cleanly.
6. **Runtime boundary:** `@harness/core` uses only Web-standard APIs. Node/Bun-only functionality lives in sibling packages.
7. **Mastra Studio as dev UI.** `mastra dev` provides agent/workflow inspection, traces, and evals. `apps/web-studio` is the production web UI.

## Non-goals — do not build these

- No vector DB or dedicated RAG primitives (Mastra offers it but we opt out).
- No bundled PII/jailbreak/toxicity classifiers — guardrail interfaces only.
- No circuit breakers or fallback-provider chains.
- No stateful HTTP sessions — server is pure `(conversationId, input) → stream`.
- No Python bridge or cross-language interop.
- No npm publishing.

## Architecture — dependency DAG

```
Mastra layer (new):
  tools ──> agents ──> workflows

Harness layer (legacy, used by apps/server + apps/web):
  core ─┬─> agent ─┬─> mcp
        │          ├─> memory-sqlite
        │          └─> hitl
        ├─> llm-adapter
        └─> observability

Shared:
  session-store (standalone)
  session-events ─> agent, core, session-store
```

Packages live in `packages/*`, example applications in `apps/*`. See each package's `package.json` for current dependencies.

- **`packages/tools/`** — Mastra `createTool` implementations (calculator, get-time, fs, fetch).
- **`packages/agents/`** — Mastra `Agent` definitions (simpleChatAgent) + `mockModel` test helper.
- **`packages/workflows/`** — Mastra `createWorkflow` compositions (deepResearchWorkflow with plan/research/fact-check/report steps + HITL suspend).
- **`mastra.config.ts`** — Root Mastra config registering agents + workflows for Studio.

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

bun run web          # @harness/example-web-studio (full app)
bun run web:server   # web-studio backend only
bun run web:ui       # web-studio Vite dev server only
bun run mastra:dev   # Mastra Studio on :4111
bun run mastra:build # Mastra production build
```

`bun run server` is wired in `package.json` but `apps/http-server` does not yet exist.

## Testing

- Unit tests colocated: `foo.ts` + `foo.test.ts`.
- **TDD enforced for `packages/*`**. Pragmatic / tests-after for `apps/*`.
- **No mocks of `Provider`.** Use `mockModel()` from `@harness/agents/testing` — scripted `MockLanguageModelV3` replay. For harness-layer tests, use `fakeProvider()` from `@harness/core/testing`.
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
- **No `console.*` in `packages/*`.** Use event bus or `@harness/observability`. (`console` is allowed in `apps/*` and test files.)
- **Formatting:** 2-space indent, single quotes, trailing commas, semicolons, LF, 100-char width, arrow parens always.

## Repository conventions

- **Conventional Commits** enforced by Commitlint + Lefthook `commit-msg`.
- **Changesets** manage CHANGELOG entries (no npm publishing).
- **Lefthook** pre-commit: Biome check + typecheck on staged files.
- **Biome** is the only linter/formatter — no ESLint, no Prettier.
- **`bunfig.toml`**: `exact = true` for lockfile determinism.
- **Docs:** `docs/specs/mastra-migration.md` (migration spec), `docs/plans/mastra-migration.md` (migration plan).
