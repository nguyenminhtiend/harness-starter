# apps/web-studio — CLAUDE.md

Scoped guidance for this app. Repo-wide rules live in the root `CLAUDE.md`.

## What this app is

Local-first web UI for running Mastra-powered agent tools. Hono server on `localhost:3000`, React 19 + Vite 6 frontend. Two tools ship out of the box: Simple Chat (multi-turn agent) and Deep Research (workflow with HITL plan approval).

Entry: `src/server/index.ts` (Hono). UI: `src/ui/main.tsx` (React). Shared types: `src/shared/`.

## App-specific conventions

- **Tests-after, not TDD.** Per root policy, `apps/*` is pragmatic — unit tests colocated (`*.test.ts`).
- **SSE for streaming.** Each session gets `GET /api/sessions/:id/events`. Events persisted to SQLite for replay.
- **SQLite for app state.** Three tables: `settings`, `runs`, `events`. Session store inlined in `src/server/infra/session-store.ts`.
- **Settings auto-form.** Uses `z.toJSONSchema()` (Zod v4) to auto-render forms. Flat fields only in v1.
- **Design system from `sample-ui/`.** Tokens + primitives ported as typed TSX. Inline styles.
- **No legacy harness imports.** All agent/tool/workflow logic comes from `@harness/agents`, `@harness/tools`, `@harness/workflows` (Mastra-based packages). App-level infrastructure (session store, approval store, LLM catalog, event types) is inlined in `src/server/infra/`.

## Tools

**Simple Chat** (`simple-chat`) — Mastra `Agent` with calculator and get_time tools. Multi-turn via Mastra Memory (threadId). Renders in `ChatView.tsx`. Good for learning the agent loop.

**Deep Research** (`deep-research`) — Mastra `Workflow` with 4 steps: plan → approve (HITL suspend) → research → fact-check → report. Plan approval via `ApprovalStore` in `src/server/infra/approval.ts`.

## Safety rails

- Server binds `127.0.0.1` only, never `0.0.0.0`.
- API keys stay in `.env`, never sent to browser.
- `fetchTool` allowlists remain HTTPS-only.
