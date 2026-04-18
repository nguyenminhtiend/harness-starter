# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this starter is

TypeScript-first, clone-and-own (no npm publish) template for agentic AI systems. Layered modular monorepo on Bun workspaces.

**Tech stack:** TypeScript 5.7 strict · Bun workspaces · Vercel AI SDK v5 · Zod v4 · Biome · Lefthook · Commitlint · Changesets · Hono · `bun:sqlite` · `gpt-tokenizer`.

## Architecture — dependency DAG

```
core ─┬─> agent ─┬─> tools
      │          ├─> mcp
      │          ├─> memory-sqlite
      │          └─> eval ─> cli
      └─> observability
```

**Implemented packages (7):**

| Package | Path | Depends on |
|---------|------|-----------|
| `@harness/core` | `packages/core/` | — |
| `@harness/agent` | `packages/agent/` | `core` |
| `@harness/tools` | `packages/tools/` | `agent`, `core` |
| `@harness/mcp` | `packages/mcp/` | `agent`, `core` |
| `@harness/memory-sqlite` | `packages/memory-sqlite/` | `agent`, `core` |
| `@harness/observability` | `packages/observability/` | `core` |
| `@harness/cli` | `packages/cli/` | `core` (+ optional: `eval`, `evalite`) |

**Not yet implemented:** `@harness/eval`, any `apps/*`.

Layering enforced by Biome `noRestrictedImports` rules in `biome.json`. No tsconfig `references` yet. Do not add cross-package imports that violate this DAG.

**Runtime boundary:** `@harness/core` uses only Web-standard APIs (`fetch`, `ReadableStream`, `AbortSignal`). Node/Bun-only functionality (SQLite, fs, OTel exporters) must live in sibling packages — never in `core`.

**Clone-and-own invariant:** deleting any of `packages/eval/`, `packages/mcp/`, `packages/memory-sqlite/`, or `apps/http-server/` must leave the rest building and testing cleanly.

## Commands

```bash
bun install
bun run ci         # lint + typecheck + build + test
bun run lint       # biome check .
bun run format     # biome format --write .
bun run typecheck  # runs across all workspaces
bun run build      # runs across all workspaces (tsc --noEmit)
bun test           # all unit tests
bun test path/to/file.test.ts  # single test
```

**Not yet wired** (scripts exist in root `package.json` but target missing workspace packages):
- `bun run chat` → needs `@harness/example-cli-chat` in `apps/`
- `bun run server` → needs `@harness/example-http-server` in `apps/`
- `bun run eval` → needs `@harness/cli` package

## Shape invariants (non-negotiable)

1. **Stream-first.** Everything is `AsyncIterable<AgentEvent>` internally; `run()` drains the stream.
2. **Plain interfaces, no classes** for `Provider`, `Tool`, `ConversationStore`, `Compactor`, `Checkpointer`.
3. **Composition over primitives.** `subagentAsTool`, `handoff`, `graph` all produce/consume the same `Agent` type.
4. **Structured output** uses Zod via `responseFormat`; harness layers auto-repair + streaming on top.
5. **Retries wrap provider calls only**, never the outer loop. A tool that throws becomes a tool-result with `isError: true`.
6. **`AbortSignal` flows top-down:** `run → provider.stream → tool.execute`.

## Testing

- Unit tests colocated: `foo.ts` + `foo.test.ts` (38 test files across all packages).
- Eval specs in `*.eval.ts`; excluded from `bun test`. None exist yet.
- **TDD enforced for `packages/*`**. Pragmatic / tests-after for `apps/*`.
- **No mocks of `Provider`.** Use `fakeProvider()` from `@harness/core/testing` — scripted stream replay.
- Live-provider tests gated behind `HARNESS_LIVE=1`.

## CI

GitHub Actions (`.github/workflows/ci.yml`): checkout → Bun (latest) + Node 22 → `bun install --frozen-lockfile` → lint → typecheck → build → test.

## Repository conventions

- **Conventional Commits** enforced by Commitlint + Lefthook `commit-msg`.
- **Changesets** manage CHANGELOG entries (no npm publishing).
- **Lefthook** pre-commit: Biome check + typecheck on staged files.
- **Biome** is the only linter/formatter — no ESLint, no Prettier.
- **`bunfig.toml`**: `exact = true` for lockfile determinism.
- **Docs:** `docs/spec.md` (design spec), `docs/plan.md` (phase roadmap).

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

---

## Coding Behaviour Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Biased toward caution over speed — use judgment for trivial tasks.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria enable independent problem-solving. Weak criteria ("make it work") require constant clarification.
