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
8. **Clone-and-own invariant:** deleting any of `packages/eval/`, `packages/mcp/`, `packages/memory-sqlite/`, `packages/tui/`, or any `apps/*` must leave the rest building and testing cleanly.

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
      │          └─> eval ─> cli
      └─> observability

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

## Code style (Biome-enforced — violations fail CI)

These rules are **non-negotiable**. Every rule below is enforced by Biome in `biome.json`. Familiarise yourself before writing any code.

### Assertions & nullability

- **No non-null assertions (`!`).** Never write `foo!.bar`. Use optional chaining (`foo?.bar`), nullish coalescing (`foo ?? fallback`), or a proper type narrowing guard. When the result becomes `T | undefined` and the call-site requires `T`, use a conditional spread (`...(foo && { key: foo })`) or an explicit `if` guard — do **not** reintroduce `!`.

### Imports

- **No unused imports.** Every imported symbol must be referenced. Remove leftovers after refactoring.
- **Use `import type` for type-only imports.** If a symbol is only used in type positions (annotations, generics, `satisfies`), import it with `import type { … }`.
- **Use `node:` protocol** for Node.js built-ins (`import fs from 'node:fs'`, not `'fs'`).

### Statements & expressions

- **Always use block statements.** Braces are required for `if`, `else`, `for`, `while`, `do` — even single-line bodies.
  ```typescript
  // BAD
  if (x) return y;

  // GOOD
  if (x) {
    return y;
  }
  ```

### Types

- **No `any`.** Use `unknown` and narrow, or define a proper type/interface.
- **No unused variables or parameters.** Prefix intentionally-unused params with `_` if needed by a callback signature.

### Console & logging

- **No `console.*` in packages.** `console.log/warn/error` is forbidden inside `packages/*`. Use the event bus or `@harness/observability` sinks. (`console` is allowed in `apps/*` and test files.)

### Formatting (auto-enforced but good to know)

- 2-space indent, single quotes, trailing commas, semicolons always, LF line endings, 100-char line width.
- Arrow functions always have parentheses: `(x) => …`, not `x => …`.

### Before submitting

Run `bun run ci` (lint + typecheck + build + test). Fix all errors — do not suppress with `// biome-ignore` unless you add a justifying comment and there is genuinely no alternative.

## Repository conventions

- **Conventional Commits** enforced by Commitlint + Lefthook `commit-msg`.
- **Changesets** manage CHANGELOG entries (no npm publishing).
- **Lefthook** pre-commit: Biome check + typecheck on staged files.
- **Biome** is the only linter/formatter — no ESLint, no Prettier.
- **`bunfig.toml`**: `exact = true` for lockfile determinism.
- **Docs:** `docs/spec.md` (design spec), `docs/plan.md` (phase roadmap).
