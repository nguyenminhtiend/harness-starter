## Architecture Review — 2026-04-24

**Status:** Draft · **Owner:** @tien · **Reviewer:** Claude (staff-engineer review)
**Scope:** whole-repo review of the post-redesign structure against 2026 agentic-harness best practice.
**Targets confirmed with owner:**
- Primary use case: **clone-and-own template**; may grow into internal tools or customer-facing products.
- MCP (server or client): **not a priority** for this iteration.
- Mastra: **not planning to swap**. Stay hexagonal with Mastra as the default runtime, rather than pretending Mastra is optional.
- Future shape: multiple apps (coding assistant, chat+RAG, CLI variants) sharing the same core.

---

## Executive summary

The bones are right: hexagonal layering holds, the `Run` aggregate is a real event-sourced state machine, `Capability<I, O>` keeps Mastra out of the domain, and Biome `noRestrictedImports` enforces the boundary. The two real problems are framing and demonstration:

1. **The "Mastra is optional" invariant doesn't match the committed direction.** Keeping it costs review attention and adds packages that aren't pulling their weight.
2. **Multi-app support is claimed by the architecture but never demonstrated.** Only one composition root exists (`apps/api`). For a template whose selling point is hexagonal, one CLI app + a shared compose helper would move this from theory to proof.

Everything else on the punch list is small surgery that gets painful to retrofit once the second and third app land.

---

## P0 — do before the next app is added

### P0-1 · Reframe the Mastra-optional invariant
**Files:** `CLAUDE.md`, `docs/plan.md`.

Rewrite invariant #2 from "Mastra is one adapter, not a hard dependency of the domain" to:

> Mastra is the default runtime. The `Capability<I, O>` port exists so tests can fake it and so forkers can delete the Mastra subtree cleanly. Swapping Mastra for another runtime is not a goal.

**Acceptance:** CLAUDE.md and plan.md updated; no code change.

### P0-2 · Type `ExecutionContext.settings` via a generic `Capability`
**Files:** `packages/core/src/domain/capability.ts`, `packages/core/src/app/run-executor.ts`, every capability in `packages/capabilities/src/*/capability.ts`.

Today `ExecutionContext.settings: unknown` forces every capability to re-parse. Make `Capability<I, O, S = unknown>` generic over settings, have `RunExecutor` call `capability.settingsSchema.parse(settings ?? {})` once, and pass the typed result through `ExecutionContext<S>`.

**Acceptance:**
- `Capability<I, O, S>` generic; `ExecutionContext<S>` generic.
- `RunExecutor` validates settings at the boundary; invalid settings produce a typed `run.failed` event with `code: 'INVALID_SETTINGS'`.
- Capabilities delete their defensive `settingsSchema.parse()` call.
- Tests cover a settings-validation failure path.

### P0-3 · Add `v` to `SessionEvent`
**Files:** `packages/core/src/domain/session-event.ts`, `packages/http/src/types/*`, SSE consumer in `apps/console`.

Bake a constant schema version now. Starter value `v: 1`. Console branches on `v` in one place so later breaks are localized.

**Acceptance:** every `SessionEvent` carries `v: 1`; console tolerates unknown future `v`s by logging and skipping; OpenAPI spec reflects the field.

### P0-4 · Add a minimal `apps/cli` composition root
**Files:** new `apps/cli/package.json`, `apps/cli/src/main.ts`, plus a short section in README.

Proves hexagonal is real, not theater. Wires `providers + inmem stores + one capability + RunExecutor + stdout subscriber`. No HTTP, no Hono. Streams events to stdout as JSON lines.

**Acceptance:**
- `bun run --filter @harness/example-cli start "hello world"` runs `simple-chat` against the default provider and prints the stream.
- `packages/http` is not imported anywhere under `apps/cli`.

### P0-5 · Fix the RAG non-goal to match the roadmap
**File:** `CLAUDE.md`.

Rewrite the "No vector DB or dedicated RAG primitives" non-goal to:

> Core has no RAG primitives. Individual capabilities MAY embed retrieval using their own tools and adapters. No `RetrievalPort` in core.

This keeps core clean while unblocking the planned chat-RAG app.

**Acceptance:** CLAUDE.md updated; no code change.

---

## P1 — before the repo is used as a template by anyone else

### P1-1 · Consolidate Mastra-native packages
**Files:** move `packages/tools/` → `packages/capabilities/src/mastra/tools/` (same for `agents`, `workflows`). Update `package.json` workspaces, tsconfig paths, Biome `noRestrictedImports` rules, all imports.

Three fewer workspaces. Clone-and-own invariant survives: delete `packages/capabilities/src/mastra/` and the hexagonal shell still builds. Cleaner DAG for forkers.

**Acceptance:** `bun run ci` green; removing the `mastra/` subtree leaves core + adapters + http building (verify in a scratch branch).

### P1-2 · Extract `composeHarness()` into a bootstrap layer
**Files:** new `packages/bootstrap/src/compose.ts` (or add to `packages/core/src/app/`).

Pull the wiring currently in `apps/api` (config → adapters → capabilities → registry → executor) into a helper parameterised on `{ capabilities, stores, providers, clock, idGen, logger }`. Each app ends up with a ~30-line `main.ts`.

**Acceptance:** `apps/api` and `apps/cli` both consume `composeHarness`; their main files each fit on a screen.

### P1-3 · Demonstrate per-domain capability splits
**Files:** either split `packages/capabilities` into `packages/capabilities-chat` + `packages/capabilities-research`, or document the pattern in a short `docs/capabilities-layout.md`.

When the coding-assistant and chat-RAG apps land, one shared `capabilities` package forces every app to pay for every other app's deps. Either split now or write the convention down so the first fork gets it right.

**Acceptance:** either (a) packages split and each app registers only what it uses, or (b) `docs/capabilities-layout.md` explains when to split and shows the import pattern.

### P1-4 · HITL: add `edits` to `ApprovalDecision`
**Files:** `packages/core/src/domain/approval.ts`, `packages/core/src/app/approve-run.ts`, HTTP `POST /runs/:id/approve` DTO.

Binary approve/reject is a wire-format trap. Extend to:

```ts
type ApprovalDecision =
  | { kind: 'approve'; edits?: unknown }
  | { kind: 'reject'; reason?: string };
```

Capabilities ignoring `edits` keep working; those that read it can implement plan-edit HITL.

**Acceptance:** schema updated, one capability (e.g., deep-research) demonstrates consuming `edits`, test coverage for the edits path.

### P1-5 · Rename `MemoryHandle` to reflect reality
**Files:** `packages/core/src/domain/capability.ts`, `packages/core/src/ports/memory-provider.ts`, all call sites.

Today `MemoryHandle = { conversationId }` — it's a reference, not memory. Rename to `ConversationRef` and rename `MemoryProvider` to `ConversationMemoryResolver` (or similar). Leaves room for a richer memory port later without locking the name.

**Acceptance:** rename complete; no behavioural change.

---

## P2 — nice-to-haves with real follow-on value

### P2-1 · `BudgetPort` interface (no enforcement yet)
**Files:** new `packages/core/src/ports/budget-port.ts`, no-op adapter, wire through `RunExecutor`.

`TokenUsage` already flows on events. Add a port the executor consults between steps (`shouldContinue(runId, usage) => boolean`). Default no-op. Shape is what matters — enforcement is a later task.

### P2-2 · Consolidate run lifecycle
**Files:** `packages/core/src/app/run-executor.ts`, port definitions.

`EventBus.close(runId)` + `onComplete(cb)` + `notifyComplete` is ad-hoc. Fold into a single `RunLifecycle` port or at minimum document why they're split.

### P2-3 · Route factories in `packages/http`
**Files:** `packages/http/src/app.ts`, route registration files.

Move from a single `app.ts` that registers everything to route *factories* (`createRunsRoutes(deps)`, `createCapabilitiesRoutes(deps)`, etc.). Apps compose the route set they need. Pays off the moment `apps/coding-assistant` needs a different endpoint surface.

### P2-4 · Note MCP deferral in `docs/plan.md`
**File:** `docs/plan.md`.

One paragraph: MCP is deferred; the `Capability` contract and tool registry are not forward-compatible with MCP today, and retrofitting will be a breaking change for external consumers when it lands. Keeps future-you honest.

### P2-5 · `MetricsPort` stub
**File:** new `packages/core/src/ports/metrics-port.ts`.

Pairs with the existing `Tracer` port. Counter/gauge/histogram interface, no-op default, pino adapter as the reference impl. Sets shape for OTel metrics later.

---

## Explicitly out of scope for this review

- Postgres migration (tracked in `docs/plan.md`).
- Multi-tenancy / auth (deferred).
- MCP server or client (deferred; see P2-4).
- Guardrails / PII / jailbreak classifiers (stated non-goal).
- Circuit breakers / fallback-provider chains (stated non-goal).

---

## Ordering notes

- **P0-1, P0-3, P0-5** are text-only; land them in one commit.
- **P0-2** touches every capability; land before **P1-1** so the move doesn't mask settings-typing regressions.
- **P0-4** (`apps/cli`) is the forcing function for **P1-2** (`composeHarness`). Doing cli first makes the duplication visible; doing compose first makes cli a 10-line file.
- **P1-1** (consolidate Mastra packages) should land before any new capability is added so the new layout is the one forkers see.
