# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Pre-implementation.** The repo currently contains only design docs; `packages/` and `apps/` do not exist yet. The source of truth is:

- Spec: `docs/superpowers/specs/2026-04-17-harness-starter-design.md`
- Roadmap: `docs/superpowers/plans/2026-04-17-harness-starter-roadmap.md`

The roadmap is **not** directly executable. It is an index of 13 phases (0–12). For each phase, write a detailed per-phase plan via `superpowers:writing-plans` **immediately before** executing it, then run it with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Tick phases off in the roadmap as exit criteria pass.

## What this starter is

TypeScript-first, clone-and-own (no npm publish) template for agentic AI systems. Layered modular monorepo on Bun workspaces.

**Tech stack:** TypeScript 5.7 strict · Bun workspaces · Vercel AI SDK v5 · Zod v4 · Biome · Lefthook · Commitlint · Changesets · Evalite (Vitest) · Hono · `bun:sqlite` · `gpt-tokenizer`.

## Architecture — dependency DAG

```
core ─┬─> agent ─┬─> memory-sqlite
      │          ├─> tools
      │          ├─> mcp
      │          ├─> observability
      │          ├─> eval ─> cli
      │          └─> apps/*
      └─> (apps/*)
```

Enforced by tsconfig `references` + a Biome `noRestrictedImports` rule. Do not add a cross-package import that violates this DAG.

**Runtime boundary:** `@harness/core` uses only Web-standard APIs (`fetch`, `ReadableStream`, `AbortSignal`). Node/Bun-only functionality (SQLite, fs, OTel exporters) must live in sibling packages — never in `core`.

**Clone-and-own invariant:** deleting any of `packages/eval/`, `packages/mcp/`, `packages/memory-sqlite/`, or `apps/http-server/` must leave the rest building and testing cleanly. This is a tested success criterion (Phase 12).

## Shape invariants (non-negotiable)

1. **Stream-first.** Everything is `AsyncIterable<AgentEvent>` internally; `run()` drains the stream.
2. **Plain interfaces, no classes** for `Provider`, `Tool`, `ConversationStore`, `Compactor`, `Checkpointer`.
3. **Composition over primitives.** `subagentAsTool`, `handoff`, `graph` all produce/consume the same `Agent` type.
4. **Structured output** uses Zod via `responseFormat`; harness layers auto-repair + streaming on top.
5. **Retries wrap provider calls only**, never the outer loop. A tool that throws becomes a tool-result with `isError: true`.
6. **`AbortSignal` flows top-down:** `run → provider.stream → tool.execute`.

## Testing

- Unit tests colocated: `foo.ts` + `foo.test.ts`.
- Eval specs in `*.eval.ts`; excluded from `bun test`.
- **TDD enforced for `packages/*`** (use `superpowers:test-driven-development`). Pragmatic / tests-after for `apps/*`.
- **No mocks of `Provider`.** Use `fakeProvider()` from `@harness/core/testing` — scripted stream replay.
- Live-provider tests gated behind `HARNESS_LIVE=1`.

## Commands (target — not yet wired)

These land in Phase 0. Do not run them expecting them to work until Phase 0 ships.

```
bun install
bun run ci         # lint + typecheck + build + test (target: <30s on a laptop)
bun run chat       # apps/cli-chat demo (OpenRouter by default)
bun run server     # apps/http-server (Hono, SSE)
bun run eval       # harness-eval CLI
bun test           # single test: bun test path/to/file.test.ts
```

## Repository conventions

- **Conventional Commits** enforced by Commitlint + Lefthook `commit-msg`.
- **Changesets** manage CHANGELOG entries (no npm publishing).
- **Lefthook** runs Biome + typecheck on staged files pre-commit.
- **Biome** is the only linter/formatter — no ESLint.
- **ADRs** in `docs/adr/` for every load-bearing decision from spec §2.
- **README per package** with purpose, import examples, public API table, test command.

## Non-goals — do not build these

From spec §9. Call them out in per-phase plans to prevent drift:

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