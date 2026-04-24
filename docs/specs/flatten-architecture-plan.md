## Flatten Architecture Plan — Drop ports/adapters layering

**Status:** Draft · **Owner:** @tien · **Date:** 2026-04-24
**Relationship to other plans:**
- Builds on `native-runtime-plan.md` (which drops `Capability<I, O>`). Apply this plan **after** the native-runtime work, or interleave carefully — the two touch overlapping files.
- Cancels the "hexagonal is non-negotiable" framing in `docs/plan.md` and invariant #1 in `CLAUDE.md`.
- Retains event-sourced runs, the `Run` aggregate, and `SessionEvent` — those are domain modelling, not layering.

**One-line thesis:**
> The cost of maintaining a port/adapter boundary exceeds the optionality it buys for a single-owner, clone-and-own template. Collapse the layer, keep the domain model, preserve a small number of test seams, document the swap points for the one real variation point left (storage).

---

## Why collapse now

1. **The second adapter never arrived, and won't.** The only storage adapter is in-memory; the only runtime is the default one; the only logger is pino. Ports without competing implementations are ceremony.
2. **Two packages + two folders per subsystem** (`packages/core/src/ports/x.ts` + `packages/adapters/src/x/*.ts`) triples the file count for every concern. For a solo-maintained template, the cognitive overhead per change is the dominant cost.
3. **Forkers read the structure.** They see `ports/` + `adapters/`, expect 2–3 adapters per port, find one, and lose trust that the abstraction is real. Simpler structure teaches better.
4. **Postgres — the one real variation point — doesn't need ports to swap.** A `PostgresRunStore` class alongside `InMemoryRunStore` sharing an inline TS interface is enough. The wiring in the composition root picks one.
5. **Tests keep working.** They already use the in-memory stores as "fakes" in most places. The handful of genuine test seams (clock, id gen) survive as constructor injection — no `ports/` folder required.

---

## What we keep, what we drop

### Keep
- `Run` aggregate + state machine. This is domain modelling.
- `SessionEvent` tagged union + event log + event bus pattern. Event sourcing survives.
- `RunExecutor` as the orchestrator.
- Constructor injection of a few cross-cutting concerns: `Clock`, `IdGen`, `Logger` — but as simple types defined next to their default impl, not in a `ports/` directory.
- The `@harness/http`, `@harness/capabilities`, `@harness/tools`, `@harness/agents`, `@harness/workflows` package boundaries.
- `bun run ci` discipline.

### Drop
- `packages/core/src/ports/` directory.
- `packages/adapters/` as a separate package.
- The "every I/O concern has a port and an adapter" convention.
- The "domain has zero deps outside zod" invariant. Domain may import the runtime SDK (see native-runtime-plan).
- Biome `noRestrictedImports` rules that enforce port/adapter direction.

---

## Target structure

Single flat package replacing `core` + `adapters`. Name kept as `@harness/core` to avoid churn; contents broaden.

```
packages/
  core/
    src/
      domain/
        run.ts
        session-event.ts
        approval.ts
        conversation.ts
        errors.ts
      runs/                         # feature folder: everything about running a capability
        run-executor.ts
        start-run.ts
        cancel-run.ts
        approve-run.ts
        event-mapper.ts
        stream-run-events.ts
      conversations/
        list-conversations.ts
        get-conversation-messages.ts
        delete-conversation.ts
      settings/
        get-settings.ts
        update-settings.ts
      capabilities/
        list-capabilities.ts
        get-capability.ts
        registry.ts                 # was in @harness/capabilities; see note below
      storage/                      # concrete storage implementations
        inmem-run-store.ts
        inmem-event-log.ts
        inmem-event-bus.ts
        inmem-approval-store.ts
        inmem-approval-queue.ts
        inmem-conversation-store.ts
        inmem-settings-store.ts
        # future: pg-run-store.ts, etc.
      providers/                    # model provider resolution
        catalog.ts
        env-keys.ts
        model-factory.ts
        resolver.ts
      observability/
        logger.ts                   # re-exports pino-backed default + Logger type
        tracer.ts                   # noop tracer + Tracer type
      time/
        clock.ts                    # system clock + Clock type; swap in tests
        id-gen.ts                   # crypto-randomUUID + IdGen type; swap in tests
      memory/
        conversation-memory.ts      # (was adapters/mastra/memory-provider.ts after native-runtime plan)
      index.ts
  capabilities/
  http/
  tools/
  agents/
  workflows/
apps/
  api/
  console/
```

Notes:
- **Types live next to their default impl.** `clock.ts` exports both `Clock` (type) and `systemClock()` (value). No separate file.
- **Storage classes share an inline type.** `type RunStore = { get(id): ... ; append(event): ... }` defined once at the top of `inmem-run-store.ts`; `pg-run-store.ts` implements the same type when it arrives. Structural typing, no interface-in-a-separate-file ceremony.
- **Feature folders replace "ports/app/adapters".** Everything about `runs` lives under `runs/`. Easier to navigate than domain-split layers.
- **`@harness/adapters` package is deleted**, contents merged into `@harness/core`.
- **Capability registry moves into core** (optional — see T6). Today it lives in `@harness/capabilities`; most of its callers are in core. Moving it shortens imports. Keep it in `capabilities` if that's more important for template clarity.

---

## Tasks

Apply after native-runtime-plan is done (or stage carefully). Each task lands as its own commit. `bun run ci` green at every step.

### T1 · Move storage implementations into core
**Files:** move each `packages/adapters/src/inmem/*.ts` to `packages/core/src/storage/inmem-*.ts`. Inline each `RunStore` / `EventLog` / `EventBus` / etc. type at the top of its impl file and delete the corresponding file under `packages/core/src/ports/`.

**Acceptance:** `packages/adapters/src/inmem/` is empty; `packages/core/src/ports/` no longer contains store interfaces; all call sites import the concrete class from `core/storage/*`.

### T2 · Move observability into core, inline types
**Files:** `packages/adapters/src/observability/pino-logger.ts` → `packages/core/src/observability/logger.ts` (export both the `Logger` type and `createPinoLogger()`). Same for tracer.

**Acceptance:** `packages/core/src/ports/logger.ts` and `ports/tracer.ts` deleted; imports updated.

### T3 · Move providers + identity into core
**Files:** `packages/adapters/src/providers/*` → `packages/core/src/providers/*`. `packages/adapters/src/identity/*` (clock, id-gen) → `packages/core/src/time/*`. Inline each type next to its default impl.

**Acceptance:** `packages/adapters/src/providers/` and `identity/` no longer exist under adapters.

### T4 · Fold runtime helpers
**Files:** `packages/adapters/src/runtime-singleton.ts` → `packages/core/src/runtime/singleton.ts`. `packages/adapters/src/conversation-memory.ts` → `packages/core/src/memory/conversation-memory.ts`.

Note: these files exist only after `native-runtime-plan` T5.

**Acceptance:** `packages/adapters/src/` is empty.

### T5 · Reorganise core into feature folders
**Files:** move `packages/core/src/app/*` → `packages/core/src/{runs,conversations,settings,capabilities}/` split by feature. Keep `packages/core/src/domain/` for data types shared across features.

**Acceptance:** `packages/core/src/app/` no longer exists; feature folders own their use cases.

### T6 · Delete the `@harness/adapters` workspace
**Files:** delete `packages/adapters/`. Remove from `package.json` workspaces. Update every `@harness/adapters` import in `@harness/http`, `@harness/capabilities`, `apps/api`, `apps/cli` (if it exists yet) to import from `@harness/core`.

**Acceptance:** `rg '@harness/adapters'` returns nothing; `bun install` succeeds; `bun run ci` green.

### T7 · Remove `noRestrictedImports` layer rules
**Files:** `biome.json`.

Drop the rules that forbid `core → adapters` and similar direction-enforcing entries. Keep only the rules that matter after the collapse: `apps/console` still imports only HTTP DTO types; `packages/http` still doesn't reach into app internals (feature folders).

**Acceptance:** layering rules reflect the new shape; lint passes.

### T8 · Rewrite `CLAUDE.md` invariants
**Files:** `CLAUDE.md`, `docs/plan.md`.

Replace invariants 1–4 (hexagonal, Capability port, event-sourced, Mastra primitives) with:

> 1. **Event-sourced runs.** The `Run` aggregate emits `SessionEvent`s. All run-state mutation flows through `Run`.
> 2. **Capability definitions are data.** A capability is a `CapabilityDefinition` (metadata + runner). No runtime-swap abstraction.
> 3. **Storage implementations are classes.** Structural types at the top of the file, not a separate `ports/` directory. Swap in-memory → Postgres by adding another class and choosing at wire time.
> 4. **Test seams live on `Clock` and `IdGen` (plus scripted `mockModel()`).** No general port-fake harness.

Update the "Architecture" diagram in `docs/plan.md` to show feature folders instead of hexagonal layers.

**Acceptance:** docs and code tell the same story.

### T9 · Update package DAG diagram + docs
**Files:** `CLAUDE.md` package DAG, `README.md` if relevant.

The post-collapse DAG is:
```
tools ─┐
agents ─┼─→ capabilities ─→ core ─→ http
workflows ─┘                       ↑
                         apps/api ─┘
                         apps/console (http types only)
```

**Acceptance:** diagrams match code.

---

## Testing after the collapse

The tests in `packages/core/src/app/*.test.ts` currently use `FakeEventLog`, `FakeRunStore`, etc. from `@harness/core/testing`. After collapse:

- **Default path:** tests use the real in-memory implementations from `core/storage/`. They're already in-memory; no fake needed.
- **Where behaviour varies (clock, id-gen, approval timing):** constructor-inject a test double. Keep `FakeClock` and `FakeIdGen` in `core/testing/` because they test timing/ordering-dependent code.
- **Delete the other fakes** (`FakeEventLog`, `FakeEventBus`, `FakeRunStore`, `FakeApprovalStore`). They were proxies for a port that no longer exists.

**Acceptance criterion for this philosophy:** after T1, the existing tests pass against the real in-memory stores with only `FakeClock` / `FakeIdGen` retained.

---

## How Postgres swap still works

This is the one real variation point. Without a port, the plan is:

1. Add `packages/core/src/storage/pg-run-store.ts` (etc.) implementing the same structural type that `inmem-run-store.ts` exports.
2. `apps/api/src/main.ts` reads an env var (`HARNESS_STORAGE=inmem|postgres`) and instantiates the right class.
3. No other file changes.

The "port interface" was purely ceremonial — the structural type works identically. If later a second store emerges, extract a `type RunStore = ...` file only when duplication becomes painful. YAGNI until then.

---

## What we're accepting by collapsing

- **Layering is convention, not enforcement.** Biome no longer blocks `http → storage` directly. We rely on code review + feature-folder discipline.
- **The "hexagonal" teaching value is gone.** Forkers see feature folders. The template now teaches "modular monolith + event-sourced runs" instead of "hexagonal + ports/adapters". That's a conscious downgrade for maintenance cost reduction.
- **A future runtime swap is expensive.** We already accepted this in `native-runtime-plan.md`.
- **The domain layer no longer has the "zero deps beyond zod" property.** `@harness/core` imports the runtime SDK, pino, `@opentelemetry/api`. This is the biggest philosophical shift — worth being explicit about.

---

## What stays off-limits even after the collapse

Not every boundary goes. These hold:

- `apps/console` imports only HTTP DTO types (`@harness/http/types`). The frontend never reaches into core.
- `@harness/http` defines routes + DTOs; it doesn't own storage or run execution — that stays in `@harness/core`.
- The `Run` aggregate is still the only thing that mutates run state. Routes call use cases; use cases call `Run`; `Run` emits events.

These are module boundaries that earn their keep. Hexagonal layering does not.

---

## Interaction with prior plans

| Item | Status after this plan |
|---|---|
| `docs/plan.md` hexagonal framing | **Obsolete.** T8 rewrites the invariants. |
| `architecture-review-2026-04.md` P0-1 (reframe Mastra-optional) | Absorbed into native-runtime-plan T8. |
| `architecture-review-2026-04.md` P0-2 (type settings) | Still applies — do during `native-runtime-plan` T3. |
| `architecture-review-2026-04.md` P0-3 (`v` on SessionEvent) | Unchanged. |
| `architecture-review-2026-04.md` P0-4 (`apps/cli`) | Still applies — will use the collapsed `@harness/core`. |
| `architecture-review-2026-04.md` P0-5 (RAG non-goal) | Unchanged. |
| `architecture-review-2026-04.md` P1-1 (consolidate runtime packages) | Dropped by `native-runtime-plan`. |
| `architecture-review-2026-04.md` P1-2 (`composeHarness`) | Still applies — easier after the collapse. |
| `architecture-review-2026-04.md` P1-3 (capability split per domain) | Unchanged. |
| `architecture-review-2026-04.md` P1-4 (`HitlDecision` with edits) | Unchanged. |
| `architecture-review-2026-04.md` P1-5 (rename `MemoryHandle`) | Unchanged; do during T4. |

---

## Ordering

1. Finish `native-runtime-plan.md` T1–T9.
2. Then run this plan T1 → T9 in order.
3. `composeHarness` (review P1-2) lands last, as it touches the newly-shaped `apps/*` bootstrap paths.

Do not start this plan before the native-runtime plan is complete — the moves would collide.
