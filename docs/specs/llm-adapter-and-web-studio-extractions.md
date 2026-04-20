# Spec: `@harness/llm-adapter` + web-studio generic extractions

Status: **Draft — awaiting human approval**
Owner: Tien Nguyen
Date: 2026-04-20

## Objective

Promote the multi-provider LLM glue currently living in `apps/web-studio/src/server/features/sessions/sessions.runner.ts` (plus three other generic subsystems) into standalone workspace packages. This unlocks two things:

1. **Any app in the monorepo can swap providers declaratively** via a `provider:model` spec string (`google:gemini-2.5-flash`, `openrouter:anthropic/claude-sonnet-4`, `groq:llama-3.3-70b-versatile`) instead of copy-pasting provider wiring.
2. **Future UI/server apps** (not just web-studio) can reuse the session persistence, HITL approval flow, and AgentEvent→UIEvent bridge without cloning web-studio's server/.

Users: harness-starter consumers (clone-and-own, no npm publish). Primary first-consumer: `apps/web-studio`.

Success looks like:
- Web-studio drops its inline `createProvider`, `parseModelSpec`, hardcoded model catalog, SQLite schema, SSE bridge, approval store, and HITL session store, and instead imports them from 4 new packages.
- The new packages are independently deletable per invariant 8 (deleting any leaves the rest building).
- `bun run ci` stays green on the whole workspace after the move.
- `apps/cli-chat` and `apps/deep-research` are **unchanged** (out of scope).

## Tech stack

Matches the rest of the repo:
- TypeScript 5.7 (strict), Bun workspaces, Zod v4, Biome, Lefthook.
- Vercel AI SDK v5 via `ai`, `@ai-sdk/google`, `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`.
- `bun:sqlite` for the session store (Node/Bun-only).
- Vitest-flavored `bun test` colocated `*.test.ts`.

## Commands

Same as root repo — new packages plug into the existing CI:
```bash
bun install
bun run ci                 # lint + typecheck + build + test across workspaces
bun test packages/llm-adapter/src/provider.test.ts   # single file
bun test packages/session-store                       # directory
bun run lint
bun run format
bun run typecheck
bun run build
```

No new top-level scripts.

## Project structure

Four new packages, one web-studio refactor. All new packages follow the `packages/<name>/{src,package.json,tsconfig.json,README.md}` layout used by `@harness/tools`, `@harness/mcp`, etc.

```
packages/llm-adapter/
  src/
    index.ts              # public exports
    provider.ts           # createProvider(keys, spec) + parseModelSpec
    provider.test.ts      # uses fakeProvider for harness contract; scripted keys for spec parsing
    keys.ts               # ProviderKeys type + loadProviderKeysFromEnv()
    keys.test.ts
    catalog.ts            # knownModels: ModelEntry[] + listAvailableModels(keys)
    catalog.test.ts
    types.ts              # ModelSpec, ModelEntry, ProviderId
  package.json            # deps: @ai-sdk/google, @ai-sdk/groq, @openrouter/ai-sdk-provider,
                          #       @harness/core (for aiSdkProvider + Provider type)
  tsconfig.json
  README.md

packages/session-store/
  src/
    index.ts
    schema.ts             # SQL for runs+events tables (settings stays in web-studio)
    session-store.ts      # createSessionStore(db): SessionStore
    session-store.test.ts # TDD — in-memory bun:sqlite
    types.ts              # SessionRow, SessionStatus, StoredEvent, filters
  package.json            # deps: none beyond bun types (peer: bun:sqlite Database)
  tsconfig.json
  README.md

packages/session-events/
  src/
    index.ts
    events.ts             # UIEventBase, StatusEvent, ToolEvent, AgentPhaseEvent,
                          #   MetricEvent, CompleteEvent, ErrorEvent, HitlRequired/Resolved
    bridge.ts             # agentEventToUIEvents(), bridgeBusToUIEvents()
    bridge.test.ts        # scripted AgentEvent stream → expected UIEvent list
    sse.ts                # tiny SSE encode helper (optional; only if used by session-store consumers)
  package.json            # deps: @harness/core (EventBus, AgentEvent type)
                          # NOTE: does NOT export planner/researcher/writer/factchecker —
                          # those stay in web-studio as app-level event extensions.
  tsconfig.json
  README.md

packages/hitl/
  src/
    index.ts
    approval-store.ts     # createApprovalStore() — Promise-based waitFor/resolve
    approval-store.test.ts
    hitl-session-store.ts # createHitlSessionStore() — register/unregister live sessions
    hitl-session-store.test.ts
    types.ts              # ApprovalDecision, HitlRegistration
  package.json            # deps: @harness/agent (Checkpointer type only)
  tsconfig.json
  README.md

apps/web-studio/        (refactor, no new files except maybe a small adapter)
  src/server/
    config.ts             # now re-exports ProviderKeys from @harness/llm-adapter
    features/sessions/sessions.runner.ts
                          # imports createProvider, parseModelSpec from @harness/llm-adapter
                          # imports agentEventToUIEvents, bridgeBusToUIEvents from @harness/session-events
                          # imports createApprovalStore, createHitlSessionStore from @harness/hitl
                          # imports createSessionStore from @harness/session-store
    features/sessions/sessions.approval.ts     DELETED
    features/sessions/sessions.hitl.ts         DELETED
    features/sessions/sessions.bridge.ts       DELETED
    features/sessions/sessions.store.ts        DELETED (types move to @harness/session-store;
                                                        app keeps only the thin wire-up if needed)
    features/sessions/sessions.types.ts        kept — SessionContext/SessionHandle stay app-level
    infra/db.ts           # keeps the `settings` table DDL; runs/events come from @harness/session-store/schema
    index.ts              # /api/models now calls listAvailableModels(keys) from llm-adapter
  src/shared/events.ts    # keeps ONLY the app-specific event variants (planner/researcher/writer/factchecker);
                          # base + generic variants re-exported from @harness/session-events
```

### Dependency DAG after the change

```
core ─┬─> agent ─┬─> tools
      │          ├─> mcp
      │          ├─> memory-sqlite
      │          ├─> eval ─> cli
      │          ├─> hitl                      (NEW — Checkpointer type only)
      │          └─> llm-adapter               (NEW — uses Provider + aiSdkProvider from core)
      ├─> session-events                       (NEW — AgentEvent/EventBus types from core)
      └─> observability

session-store                                   (NEW — zero harness deps; peer-consumes a bun:sqlite Database)

tui (unchanged, standalone)

apps/web-studio → @harness/{llm-adapter, session-events, session-store, hitl, agent, core, ...}
apps/cli-chat, apps/deep-research → unchanged
```

Enforced via Biome `noRestrictedImports` in `biome.json` — extend existing rules.

## Code style

Matches root CLAUDE.md exactly: 2-space indent, single quotes, trailing commas, semicolons, 100-char width, `import type`, `node:` protocol, braces on every `if`, no `!`, no `any`, no `console.*` in `packages/*`.

Example of the public surface we're targeting — one snippet beats paragraphs of prose:

```ts
// packages/llm-adapter/src/index.ts
export type { ModelEntry, ModelSpec, ProviderId, ProviderKeys } from './types.ts';
export { parseModelSpec, createProvider } from './provider.ts';
export { loadProviderKeysFromEnv } from './keys.ts';
export { knownModels, listAvailableModels } from './catalog.ts';
```

```ts
// apps/web-studio/src/server/features/sessions/sessions.runner.ts (after)
import { createProvider, parseModelSpec } from '@harness/llm-adapter';
import {
  agentEventToUIEvents,
  bridgeBusToUIEvents,
  type UIEvent,
} from '@harness/session-events';
// ...
const provider = createProvider(providerKeys, modelSpec);
```

```ts
// packages/llm-adapter/src/provider.ts — structural shape
import { aiSdkProvider, type Provider } from '@harness/core';
// ...
export function parseModelSpec(raw: string): ModelSpec {
  const idx = raw.indexOf(':');
  if (idx === -1) {
    return { provider: 'openrouter', model: raw };
  }
  return { provider: raw.slice(0, idx) as ProviderId, model: raw.slice(idx + 1) };
}

export function createProvider(keys: ProviderKeys, spec: string): Provider {
  const { provider, model } = parseModelSpec(spec);
  const factory = PROVIDER_FACTORIES[provider];
  if (!factory) {
    throw new Error(
      `Unknown provider "${provider}". Use "google:", "openrouter:", or "groq:" prefix.`,
    );
  }
  return factory(keys, model);
}
```

No classes — plain interfaces + factories, matching invariant 2.

## Testing strategy

Per root CLAUDE.md: **TDD enforced for `packages/*`**, colocated `*.test.ts`.

- `llm-adapter`:
  - `parseModelSpec` — pure function, exhaustive string cases (prefix, no prefix, empty, weird colons).
  - `createProvider` — stub out the ai-sdk factory functions via dependency injection (export an internal `__setProviderFactories` for tests), assert the right factory is invoked with the right key/model. Do **not** hit live providers. No `fakeProvider` needed here since we're testing the factory, not the Provider contract — but return a fake LanguageModel to confirm `aiSdkProvider(model)` is called.
  - `loadProviderKeysFromEnv` — mutate `process.env` inside `beforeEach`, restore after.
  - `listAvailableModels(keys)` — combinatorial: every subset of configured keys produces the right catalog slice.
- `session-store`:
  - Use `new Database(':memory:')` from `bun:sqlite` per test. Cover `createSession`/`updateSession`/`appendEvent`/`getEvents`/`listSessions` including the `q`/`status`/`limit` filters.
  - Seq-counter correctness across reopens (current behavior: `COALESCE(MAX(seq), 0)` lookup).
- `session-events`:
  - `agentEventToUIEvents` — scripted `AgentEvent` inputs per `case` branch → expected `UIEvent[]`. Include the accUsage mutation assertion.
  - `bridgeBusToUIEvents` — create a real `@harness/core` `createEventBus`, emit events, assert push callback receives them; verify `unsub()` silences further pushes.
- `hitl`:
  - Approval store: concurrent `waitFor` + `resolve` — resolver wakes exactly one waiter with the payload.
  - HITL session store: register/unregister lifecycle; double-register throws or is idempotent (decide in task); aborting via stored `AbortController` propagates.

Coverage expectation: every public export has at least one test. Live-provider tests gated behind `HARNESS_LIVE=1` per existing convention — none anticipated for the new packages because the provider layer is tested at the `aiSdkProvider` boundary.

Web-studio tests: existing `sessions.runner.test.ts`, `sessions.bridge.test.ts`, `sessions.approve.test.ts`, `settings.store.test.ts` must keep passing after the refactor. If they directly import from `./sessions.bridge.ts` or `./sessions.approval.ts`, update imports to the new package paths.

## Boundaries

### Always do
- Keep each new package independently buildable and deletable (invariant 8).
- Extend Biome's `noRestrictedImports` so `core`/`agent` cannot import the new packages.
- Use `import type` for anything type-only.
- Run `bun run ci` after each task in the plan; fix issues before moving on.
- Mirror existing package shapes (look at `@harness/mcp`, `@harness/memory-sqlite` before scaffolding).

### Ask first
- Any change to `@harness/core` or `@harness/agent` public surface (e.g., exposing new types the new packages need).
- Adding a provider beyond google/openrouter/groq.
- Changing the `runs`/`events` SQLite schema — callers downstream may depend on column names.
- Moving `SessionContext`/`SessionHandle` types out of web-studio (they currently reference app-only `ProviderKeys` and UI shapes; could be decoupled later but not in this spec).
- Migrating `apps/cli-chat` or `apps/deep-research` — explicitly out of scope.

### Never do
- Import `bun:sqlite`, `node:fs`, or `node:path` into `llm-adapter`, `session-events`, or `hitl` (keep invariant 7 intact).
- Publish any of these packages to npm (invariant: no npm publishing).
- Bypass the clone-and-own invariant by making a package hard-depend on `session-store` when it could peer-depend on a `Database` handle.
- Re-introduce a `createProvider` helper inside `apps/web-studio` after the migration.
- Skip pre-commit hooks with `--no-verify`.

## Success criteria

Testable, specific, enumerated:

1. `packages/llm-adapter/` exists; `bun test packages/llm-adapter` passes with ≥1 test per public export.
2. `packages/session-store/`, `packages/session-events/`, `packages/hitl/` exist and pass their own tests.
3. `apps/web-studio/src/server/features/sessions/sessions.{approval,hitl,bridge,store}.ts` are deleted.
4. `apps/web-studio/src/server/features/sessions/sessions.runner.ts` imports from the four new packages and contains no `createOpenRouter`/`createGoogleGenerativeAI`/`createGroq` call.
5. `apps/web-studio/src/server/index.ts`'s `/api/models` returns the same list as before, sourced from `listAvailableModels(keys)` in `@harness/llm-adapter`.
6. Manually deleting any one of the four new package directories and running `bun run ci` fails only the consumers of that package (web-studio), not the other new packages.
7. `bun run ci` at the repo root passes.
8. `apps/cli-chat/src/provider.ts` and `apps/deep-research/src/provider.ts` are byte-identical to pre-change state.
9. Running `bun run --filter @harness/example-web-studio dev`, creating a deep-research session with `google:gemini-2.5-flash`, and approving the plan produces streamed UI events end-to-end (manual smoke test).

## Open questions

1. **`session-store` peer vs. direct dep on `bun:sqlite`**: Should the package `import { Database } from 'bun:sqlite'` and export `createDatabase(path)` too, or keep it as a thin layer over a caller-provided `Database` instance (current web-studio shape)? Leaning toward the latter so the app still owns `DATA_DIR`/journal-mode setup and the `settings` table.
2. **Should `@harness/session-events` also own the generic `SessionMeta`/`SessionStatus` shape** currently in `apps/web-studio/src/shared/events.ts`? These are cross-cut (server + UI). Probably yes — it's the type already consumed by both sides.
3. **`@harness/hitl` + `@harness/session-store` coupling**: the hitl store holds `Checkpointer` + `AbortController`. Should it live in the session-store package instead, since both relate to "session lifecycle"? Keeping them separate per your answer, but worth confirming once.
4. **`ProviderKeys` location**: spec places it in `llm-adapter`. web-studio's `config.ts` currently owns it. After the move, `config.ts` should re-export or drop — confirm naming (`ProviderKeys` vs `LlmProviderKeys`).
5. **Extra extraction candidates NOT adopted in this spec** (for future consideration only, per your answer):
   - `apps/web-studio/src/server/infra/broadcast.ts` (generic SSE fan-out) — could join `session-events` later.
   - `apps/web-studio/src/ui/hooks/useEventStream.ts` (React SSE consumer) — web-only React package (`@harness/session-events-react`?).
   - `apps/web-studio/src/ui/components/primitives.tsx` + `tokens.css` (design system from `sample-ui/`) — belongs in a `@harness/ui-primitives` only if a second frontend ships.
   - Settings auto-form (`z.toJSONSchema()` rendering) — generic enough for a `@harness/settings-ui` package but only useful once a second app uses it.
   - `apps/web-studio/src/server/features/settings/*` (flat-field settings + per-tool overrides) — generic but tied to the `ToolDef` shape which itself is app-local.

## Next step

After human sign-off on this spec, run `/plan` against it to produce an ordered, verifiable task breakdown under `docs/plans/`.
