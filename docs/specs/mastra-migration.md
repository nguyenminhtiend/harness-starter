# Spec: Mastra Framework Migration

**Status:** Draft · **Owner:** @tien · **Date:** 2026-04-23
**Related plan:** [`docs/plans/mastra-migration.md`](../plans/mastra-migration.md)

---

## Objective

Replace the custom `@harness/*` agent harness with [Mastra](https://mastra.ai) (`@mastra/core` v1.x, March 2026 line) so that the repo carries feature code, not framework code.

**Target user:** the maintainer (you) — reduced surface area, fewer bespoke primitives to keep correct, first-class access to Mastra Studio for observability & evals.

**Why Mastra:**
- `@mastra/core` covers every primitive currently hand-rolled here: `Agent`, `Tool`, `Workflow` (w/ `suspend/resume` → replaces HITL), `Memory`, `Storage`, `MCP`, telemetry, evals.
- Active release cadence (monthly changelogs through 2026-03); TypeScript-native, Zod v4-compatible.
- Mastra Studio supplants bespoke eval/observability UI — one less thing to maintain.

**What success looks like:** `apps/web-studio` runs end-to-end (simple-chat + deep-research) on `@mastra/core`; the harness `packages/*` it previously depended on are deleted; `bun run ci` is green; no regressions in the two tools' golden-path UX.

### Acceptance criteria

1. `apps/web-studio` imports zero `@harness/*` packages at end-state.
2. Simple-chat (calculator, get_time) works as multi-turn chat with streaming tool calls visible in UI.
3. Deep-research runs as a Mastra Workflow with plan-approval via `workflow.suspend()` → resume, preserving the current HITL modal UX.
4. Conversation memory persists in LibSQL across server restarts (new behavior, improvement over current in-memory map).
5. `mastra dev` opens Mastra Studio; agent traces & eval runs are visible there.
6. Deleted: `apps/cli-chat`, `packages/tui`, and every harness package superseded by Mastra (see §Project Structure).
7. `bun run ci` green; full test suite including new Mastra-based `fakeProvider` equivalents.

---

## Tech Stack

| Layer | Before | After |
|---|---|---|
| Agent loop | `@harness/agent` `createAgent()` | `@mastra/core/agent` `new Agent({...})` |
| Provider layer | `@harness/llm-adapter` wrapping `ai-sdk` | `ai-sdk` v5 (model strings) passed directly to Mastra |
| Tools | `@harness/agent` `tool()` helper | `@mastra/core/tools` `createTool({...})` |
| Workflows | `@harness/agent` `graph()` | `@mastra/core/workflows` `createWorkflow()` + steps |
| Memory | `@harness/memory-sqlite` + `@harness/session-store` | `@mastra/memory` + `@mastra/libsql` |
| HITL | `@harness/hitl` | `workflow.suspend()` / `workflow.resume()` |
| MCP | `@harness/mcp` | `@mastra/mcp` |
| Evals | `@harness/eval` + `@harness/cli` | `@mastra/evals` + Mastra Studio |
| Telemetry | `@harness/observability` (OTel + Langfuse) | Mastra built-in telemetry; Langfuse exporter |
| Dev UI | none / `apps/web-studio` | `mastra dev` Studio (eval + traces); `apps/web-studio` keeps its product-facing role |
| Runtime | Bun 1.x | Bun 1.x (Mastra Bun-compatible per v1.x docs) |
| Validation | Zod v4 | Zod v4 |
| Lint/Format | Biome 2.4 | Biome 2.4 |

**New package dependencies:** `@mastra/core`, `@mastra/memory`, `@mastra/libsql`, `@mastra/mcp`, `@mastra/evals`, `mastra` (CLI). Exact versions pinned in `bun install --exact`.

---

## Commands

Unchanged project commands:

```bash
bun install
bun run ci             # lint + typecheck + build + test
bun run lint           # biome check .
bun run format         # biome format --write .
bun run typecheck
bun run build
bun test
bun test path/to/file.test.ts
bun run web            # @harness/example-web-studio dev
bun run web:server
bun run web:ui
```

Removed:

```bash
bun run chat           # cli-chat deleted
bun run research       # deep-research moves under web-studio; no standalone command
bun run eval           # @harness/cli deleted; use mastra eval instead
```

Added (Mastra CLI):

```bash
bun run mastra:dev     # → mastra dev  (Studio on :4111, traces + eval runner UI)
bun run mastra:build   # → mastra build
bun run mastra:eval    # → mastra evals run
```

`bun run server` stays a no-op (unchanged from today — `apps/http-server` not yet created).

---

## Project Structure

### End-state

```
packages/
  agents/          NEW · exported Mastra Agent objects (e.g. simpleChatAgent)
  tools/           REWRITTEN · exported Mastra Tool objects (calculator, getTime, fs, fetch)
  workflows/       NEW · exported Mastra Workflow objects (deepResearchWorkflow)
apps/
  web-studio/      MIGRATED · Hono + React; backend composes packages/* Mastra objects
  web/             UNCHANGED this pass (still on @harness/*; follow-up migration)
  server/          UNCHANGED this pass
docs/
  specs/           this spec lives here
  plans/           plan lives here
mastra.config.ts   NEW · top-level Mastra config (agents, workflows, storage, telemetry)
```

### Deleted at end-state

```
packages/agent           → @mastra/core/agent
packages/core            → @mastra/core
packages/llm-adapter     → ai-sdk directly
packages/memory-sqlite   → @mastra/libsql
packages/session-store   → @mastra/memory
packages/session-events  → @mastra/core event streams
packages/mcp             → @mastra/mcp
packages/eval            → @mastra/evals
packages/cli             → mastra CLI
packages/observability   → @mastra/core telemetry + Langfuse exporter
packages/hitl            → workflow.suspend()/resume()
packages/tools           → rewritten under same name (Mastra tools)
packages/tui             → deleted outright (no consumer after cli-chat removal)
apps/cli-chat            → deleted outright
```

### Why keep `packages/*` at all (answering the Q5 concern)

Your argument: future apps (server, web) will consume these too. Fair — but be aware what's kept and what's lost:

**Kept value:**
- **One-definition reuse.** `simpleChatAgent` built once; `web-studio`, `apps/web`, and a future `apps/server` import the same object. Version & config drift stays impossible.
- **Test reuse.** Agent/tool tests live with the definitions; apps only test glue.
- **DAG discipline.** Biome `noRestrictedImports` keeps apps from reaching into workflow internals.

**Value lost vs. the old split:**
- **No runtime-boundary enforcement.** The old `packages/core` existed to keep Web-standard APIs isolated from Node-only APIs (SQLite, fs). Mastra blurs that line — `@mastra/core` imports Node APIs transitively via memory/storage. The new `packages/*` can't re-enforce this invariant; it's gone.
- **Layer count drops.** Old DAG was 5-deep (core → agent → tools → …). New DAG is 2-deep (packages/* → apps/*). Most of the architectural value of splitting sat in that depth; after Mastra absorbs the inner layers, the split is primarily code-organization.

Net: keep the split, but don't expect it to carry the same weight. If in 6 months nothing reuses `packages/agents`, collapse it into `apps/web-studio/src/mastra/` and delete the workspace entry.

### Mastra config location

```ts
// mastra.config.ts (repo root)
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { simpleChatAgent } from '@harness/agents';
import { deepResearchWorkflow } from '@harness/workflows';

export const mastra = new Mastra({
  agents: { simpleChatAgent },
  workflows: { deepResearchWorkflow },
  storage: new LibSQLStore({ url: process.env.MASTRA_DB_URL ?? 'file:./.mastra/mastra.db' }),
  telemetry: { serviceName: 'harness-starter', sampling: { type: 'always_on' } },
});
```

Mastra Studio reads this.

---

## Code Style

Biome rules in `biome.json` remain canonical — Mastra code must conform. One representative snippet below:

```ts
// packages/agents/src/simple-chat.ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { openai } from '@ai-sdk/openai';
import { calculatorTool, getTimeTool } from '@harness/tools';

const memory = new Memory({
  storage: new LibSQLStore({ url: process.env.MASTRA_DB_URL ?? 'file:./.mastra/mastra.db' }),
});

export const simpleChatAgent = new Agent({
  id: 'simple-chat',
  name: 'Simple Chat',
  instructions:
    'You are a concise assistant. Use tools when the user asks for arithmetic or the current time. ' +
    'Never fabricate tool output.',
  model: openai('gpt-5.4'),
  tools: { calculatorTool, getTimeTool },
  memory,
});
```

```ts
// packages/tools/src/calculator.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const calculatorTool = createTool({
  id: 'calculator',
  description: 'Evaluate a simple arithmetic expression. Supports + - * / ( ) and decimals.',
  inputSchema: z.object({ expression: z.string().min(1).max(200) }),
  outputSchema: z.object({ value: z.number() }),
  execute: async ({ context }) => {
    const value = evaluate(context.expression);
    return { value };
  },
});
```

**Conventions:**
- Agents, tools, workflows are exported `const`s; no factory functions unless a per-request config is needed.
- `id` is kebab-case; `name` is human-readable. Match each tool's `id` to its export symbol (`calculator` → `calculatorTool`).
- No `any`, no `!`, `import type` for type-only imports, `node:` protocol for Node built-ins, block statements always (see root CLAUDE.md for the full Biome rule list — all still apply).
- `console.*` remains forbidden in `packages/*`. Use Mastra's logger (`mastra.getLogger()`) or built-in telemetry.
- One agent/tool/workflow per file; colocated `.test.ts`.

---

## Testing Strategy

- **Framework:** `bun test` (unchanged). Tests colocated (`foo.ts` + `foo.test.ts`).
- **No `Provider` mocks.** Today's `fakeProvider()` is replaced by Mastra's `MockLanguageModelV1` (from `ai` package) or a small in-repo helper `mockModel()` in `packages/agents/src/testing.ts`. Scripted response replay pattern preserved.
- **Tool tests** run `execute()` directly with a fabricated `RuntimeContext` — pure input/output.
- **Workflow tests** run `workflow.createRun().start({...})` with a mock model; assert step outcomes and `suspend`/`resume` boundaries.
- **Integration tests** for `apps/web-studio`: boot the Hono app with an in-memory LibSQL (`file::memory:?cache=shared`), hit routes, assert SSE events. Follows today's `apps/web-studio/src/server/index.test.ts` pattern.
- **Live-provider tests** stay gated behind `HARNESS_LIVE=1`. Rename to `MASTRA_LIVE=1` for clarity — grep + replace is trivial.
- **Evals** move to `*.eval.ts` files registered with `@mastra/evals`; excluded from `bun test`; run via `bun run mastra:eval` and visible in Studio.
- **TDD enforced** for `packages/agents`, `packages/tools`, `packages/workflows`. Pragmatic / tests-after for `apps/*`.

---

## Boundaries

### Always do
- Pin Mastra versions with `bunfig.toml` `exact = true` — Mastra is moving fast (monthly minor bumps).
- Run `bun run ci` after every change; fix, don't suppress.
- Use `createTool` / `new Agent` / `createWorkflow` from `@mastra/core` — never hand-roll equivalents.
- Validate all tool inputs with Zod schemas (`inputSchema`). Validate outputs where the model output feeds another step.
- Keep Mastra config (`mastra.config.ts`) the single source of registered agents/workflows.
- Persist memory via `@mastra/libsql` (LibSQL default). `file:./.mastra/mastra.db` for dev; env-var for prod.

### Ask first
- Adding a new top-level `@mastra/*` package (e.g. `@mastra/rag`, `@mastra/deployer-*`) — each one expands scope and opens a new non-goal.
- Swapping LibSQL for another store (Postgres, Upstash) — affects deployment and dev setup.
- Enabling an eval metric that calls a live model (cost implication).
- Changing `mastra.config.ts` telemetry sampling.
- Renaming exported agent/tool/workflow IDs after they've been used in traces — breaks historical linkage in Studio.

### Never do
- Re-introduce `@harness/core` / `@harness/agent` / parallel agent loops. Mastra is the only agent runtime.
- Mock `ai-sdk` models with custom classes — use `MockLanguageModelV1` or Mastra's own helpers.
- Put Node-only code paths into `packages/agents` or `packages/tools` that must run in a browser (UI bundles only import type-level or Zod-schema exports from these).
- Revive `apps/cli-chat` or `packages/tui` — they're deleted on purpose.
- Fork Mastra source into the repo ("clone-and-own" is explicitly revoked for Mastra packages — that's the whole point of the migration).
- Commit the LibSQL `.mastra/mastra.db` dev file — add to `.gitignore` before first commit.

---

## Non-goals (for this migration pass)

- Migrating `apps/server` or `apps/web`. They stay on existing `@harness/*` packages. The old packages remain on `master` until those apps migrate in a follow-up.
- Introducing `@mastra/rag` or any vector store. Keep the existing non-goal from root CLAUDE.md.
- Production deployment. Dev-loop first; `mastra build` + hosting is a later concern.
- Supply-chain hardening of Mastra's transitive deps.
- Writing a migration shim so `@harness/agent` consumers keep working. Strangler per-app; no compat layer.

---

## Success Criteria (testable)

1. `git grep -l '@harness/agent\\|@harness/core\\|@harness/llm-adapter' apps/web-studio | wc -l` returns `0`.
2. `ls apps/cli-chat packages/tui 2>&1 | grep -q 'No such file'` — both paths gone.
3. `bun run ci` exits 0.
4. `bun run web` boots web-studio; both tools selectable; simple-chat completes ≥3 turns with visible tool-call rendering; deep-research runs through plan-approval modal to report.
5. `bun run mastra:dev` opens Studio on `http://localhost:4111`; both agents and the workflow are listed; at least one eval metric runs green.
6. Conversation survives server restart — send 2 messages, `kill` the server, restart, send turn 3; the agent recalls turn 1+2.
7. `bun.lock` contains pinned `@mastra/core`, `@mastra/memory`, `@mastra/libsql`, `@mastra/mcp`, `@mastra/evals`, `mastra` entries.

---

## Open questions

1. **Model choice & API keys.** Current code uses `@ai-sdk/openai`. Stays? (Assumed yes.) If Anthropic too, add `@ai-sdk/anthropic` and document the env var.
2. **Langfuse.** Current `@harness/observability` ships a Langfuse exporter. Mastra telemetry supports OTel → Langfuse via standard OTel collector. Need to verify the Langfuse span schema you rely on is still produced. (Deferred to Phase 5 of the plan — no blocking today.)
3. **HITL UX parity.** Current HITL plan-approval uses a custom `PlanApprovalModal`. Mastra's `suspend()` carries a payload; the UI flow stays — we just swap the backend mechanism. Confirm during Phase 3.
4. **Workspace vs. single-app Mastra config.** Mastra's default is one `src/mastra/` per app. Here we're hoisting to `mastra.config.ts` at root, importing from `packages/*`. Need to verify `mastra dev` picks up a root-level config via `--config` flag or `package.json#mastra` field.
5. **Simple-chat `conversationId`.** Mastra `Memory` uses `threadId` + `resourceId` instead. Straightforward rename but the route contract changes — `apps/web-studio`'s UI API must follow.
