# apps/web-studio — CLAUDE.md

Scoped guidance for this app. Repo-wide rules live in the root `CLAUDE.md`.

## What this app is

Local-first web UI for running harness-driven agent tools. Hono server on `localhost:3000`, React 19 + Vite 6 frontend. Deep Research is the first tool; others plug in as siblings via a `tools` registry. Replaces the CLI's flags with an interactive settings panel, live SSE streaming, and HITL plan approval.

Entry: `src/server/index.ts` (Hono). UI: `src/ui/main.tsx` (React). Shared types: `src/shared/`.

## App-specific conventions

- **Tests-after, not TDD.** Per root policy, `apps/*` is pragmatic — unit tests colocated (`*.test.ts`).
- **Provider is OpenRouter.** Requires `OPENROUTER_API_KEY` in `.env`.
- **Optional deps:** `@harness/mcp` and `@harness/memory-sqlite` are `optionalDependencies`. Code that imports them must tolerate their absence.
- **Copy, don't import** the deep-research graph factory into `src/server/tools/deep-research.ts` (clone-and-own invariant 8). No imports from `apps/deep-research/*`.
- **SSE for streaming.** Each run gets `GET /api/runs/:id/events`. Events persisted to SQLite for replay.
- **SQLite for app state.** Separate DB from harness's `@harness/memory-sqlite`. Three tables: `settings`, `runs`, `events`.
- **Settings auto-form.** Uses `z.toJSONSchema()` (Zod v4) to auto-render forms. Flat fields only in v1.
- **Design system from `sample-ui/`.** Tokens + primitives ported as typed TSX. Inline styles.

## Safety rails

- Server binds `127.0.0.1` only, never `0.0.0.0`.
- API keys (OpenRouter, Brave, Langfuse) stay in `.env`, never sent to browser.
- User question wrapped in `<user_question>…</user_question>` delimiters in prompts.
- `fetchTool` allowlists remain HTTPS-only.
