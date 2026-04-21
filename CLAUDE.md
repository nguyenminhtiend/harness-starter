# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this starter is

TypeScript-first, clone-and-own (no npm publish) template for agentic AI systems. Layered modular monorepo on Bun workspaces.

**Tech stack:** TypeScript 5.7 strict · Bun workspaces · Vercel AI SDK v5 · Zod v4 · Biome · Lefthook · Commitlint · Changesets · Hono · `bun:sqlite` · `gpt-tokenizer`.

## Shape invariants (non-negotiable)

1. **Stream-first.** Everything is `AsyncIterable<AgentEvent>` internally; `run()` drains the stream.
2. **Plain interfaces, no classes** for `Provider`, `Tool`, `ConversationStore`, `Compactor`, `Checkpointer`.
3. **Composition over primitives.** `subagentAsTool`, `handoff`, `graph` all produce/consume the same `Agent` type.
4. **Structured output** uses Zod via `responseFormat`; harness layers auto-repair + streaming on top.
5. **Retries wrap provider calls only**, never the outer loop. A tool that throws becomes a tool-result with `isError: true`.
6. **`AbortSignal` flows top-down:** `run → provider.stream → tool.execute`.
7. **Runtime boundary:** `@harness/core` uses only Web-standard APIs (`fetch`, `ReadableStream`, `AbortSignal`). Node/Bun-only functionality (SQLite, fs, OTel exporters) must live in sibling packages — never in `core`.
8. **Clone-and-own invariant:** deleting any of `packages/eval/`, `packages/mcp/`, `packages/memory-sqlite/`, `packages/tui/`, `packages/llm-adapter/`, `packages/session-store/`, `packages/session-events/`, `packages/hitl/`, or any `apps/*` must leave the rest building and testing cleanly.

## Non-goals — do not build these

- No vector DB or dedicated RAG primitives (RAG is a user-land compactor or tool).
- No bundled PII/jailbreak/toxicity classifiers — guardrail interfaces only.
- No circuit breakers or fallback-provider chains.
- No agent-manifest loader (no `agent.md` / `agent.yaml`) — agents are TS objects.
- No stateful HTTP sessions — server is pure `(conversationId, input) → stream`.
- No shell/code-exec built-in tool in v1.
- No Python bridge or cross-language interop.
- No auto-upgrade tooling — `docs/upgrading.md` documents cherry-pick flow.
- No npm publishing.

## Architecture — dependency DAG

```
core ─┬─> agent ─┬─> tools
      │          ├─> mcp
      │          ├─> memory-sqlite
      │          ├─> hitl
      │          └─> eval ─> cli
      ├─> llm-adapter
      └─> observability

session-store (standalone — zero harness deps)
session-events ─> agent, core, session-store
tui (standalone — no harness deps)
```

Packages live in `packages/*`, example applications in `apps/*`. See each package's `package.json` for current dependencies.

Layering is enforced by Biome `noRestrictedImports` rules in `biome.json`. No tsconfig `references` yet. Do not add cross-package imports that violate this DAG.

## Commands

```bash
bun install
bun run ci         # lint + typecheck + build + test
bun run lint       # biome check .
bun run format     # biome format --write .
bun run typecheck  # across all workspaces
bun run build      # across all workspaces (tsc --noEmit)
bun test           # all unit tests
bun test path/to/file.test.ts  # single test

bun run chat       # @harness/example-cli-chat
bun run research   # @harness/example-deep-research (pass args after --)
bun run eval       # @harness/cli eval
```

`bun run server` is wired in `package.json` but `apps/http-server` does not yet exist.

## Testing

- Unit tests colocated: `foo.ts` + `foo.test.ts`.
- Eval specs in `*.eval.ts`; excluded from `bun test`.
- **TDD enforced for `packages/*`**. Pragmatic / tests-after for `apps/*`.
- **No mocks of `Provider`.** Use `fakeProvider()` from `@harness/core/testing` — scripted stream replay.
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
- **Docs:** `docs/spec.md` (design spec), `docs/plan.md` (phase roadmap).
