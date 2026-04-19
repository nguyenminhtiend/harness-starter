# apps/deep-research — CLAUDE.md

Scoped guidance for this app. Repo-wide rules live in the root `CLAUDE.md`.

## What this app is

CLI that produces well-cited markdown research reports via a **planner → N parallel researchers → writer → fact-checker** pipeline. Exercises the full harness surface: `graph`, `subagentAsTool`, HITL, budgets, observability, TUI.

Entry: `src/index.ts`. Graph: `src/graph.ts`. Agents: `src/agents/*`. See `README.md` for CLI flags and env vars.

## App-specific conventions

- **Tests-after, not TDD.** Per root policy, `apps/*` is pragmatic — unit tests colocated (`*.test.ts`), integration in `tests/`, evals in `evals/*.eval.ts`.
- **Evals run live.** `bun run --filter @harness/example-deep-research eval` sets `HARNESS_LIVE=1`; they hit the real provider. Do not commit eval changes without running them.
- **Provider is OpenRouter.** `src/provider.ts` wraps `@openrouter/ai-sdk-provider`. Requires `OPENROUTER_API_KEY`.
- **Optional deps:** `@harness/mcp` and `@harness/memory-sqlite` are `optionalDependencies`. Code that imports them must tolerate their absence (the clone-and-own invariant applies per-app).
- **Graph state is an untyped bag.** Nodes read/write via `as`-casts (known gap — see REVIEW.md). If you add a new state field, also extend the informal shape documented at the top of `graph.ts`.
- **Structured output via Zod.** Planner returns `ResearchPlan`, writer returns `Report`, researcher returns `Finding`. Schemas live in `src/schemas/`.
- **Budgets split across subagents.** `src/budgets.ts` divides the top-level USD/token ceiling between planner/researchers/writer/fact-checker. Any new node must claim a share.
- **Reports are written atomically.** `src/report/write.ts` writes to a temp file then renames. Do not bypass this.

## Known issues — check before duplicating work

`REVIEW.md` at this path enumerates current bugs (e.g. search tools not wired into CLI flow, writer structured output discarded, fact-checker has no source access). Read it before touching `index.ts` or `graph.ts`.

## Safety rails

- **`fetchTool` allowlist must be HTTPS-only** for any new agent. The deprecated `createResearchAgent` uses `/.*/ ` — do not copy that pattern.
- **User question is interpolated into prompts.** If you add prompt builders that take user input, wrap it in delimiters (`<user_question>…</user_question>`).
- **No `npx -y` without a pinned version** when adding MCP tools — supply-chain risk.
