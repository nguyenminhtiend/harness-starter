# Architecture Review — harness-starter

_Reviewer: senior solution architect / staff engineer pass._
_Date: 2026-04-25._
_Branch: `feat/mastra-migration`._

## Verdict

Solid foundation. The `Run` aggregate, `SessionEvent` union, storage shape, and Biome-enforced DAG are textbook. Roughly **85% disciplined code, 15% premature flexibility**, plus one real invariant leak. Items below are ranked by impact.

---

## Strengths (keep as-is)

- `Run` aggregate + `SessionEvent` discriminated union (`packages/core/src/domain/`) — clean DDD; all state mutation funnels through `Run.emit()`.
- `noRestrictedImports` in `biome.json` enforces the package DAG at lint time — better than docs alone.
- Storage pattern (interface at top of file + `createInMemory*()` factory) is consistently applied across all 7 stores.
- `composeHarness()` (108 LOC) is flat assembly — no factory-of-factories.
- Capability shape (`CapabilityDefinition` = data + single-function runner) is the right amount of abstraction.

---

## Real issues (fix these)

### 1. `DELETE /runs/:id` bypasses the Run aggregate — violates invariant #1

`packages/http/src/routes/runs.routes.ts:76-86` calls `deps.eventLog.deleteByRunId()` and `deps.runStore.delete()` directly. CLAUDE.md invariant #1: *"No route calls store methods directly."* This is the only place I found that breaks it, and it's the most destructive op (cascading delete).

**Fix:** Move it behind a `deleteRun(deps, runId)` use case in `packages/core/src/runs/`.

### 2. `HarnessDeps` types leak the in-memory implementation

`packages/bootstrap/src/compose.ts:25-39` declares fields as `ReturnType<typeof createInMemoryRunStore>` etc. The moment a Postgres store is added (the stated reason for the interface+class pattern), every type in `HarnessDeps` breaks, and every `HttpAppDeps` consumer along with it.

**Fix:** Replace each with the structural interface from `@harness/core` (`RunStore`, `EventLog`, `ApprovalStore`, …). Trivial change, large blast-radius improvement.

### 3. `runAbortControllers: Map<string, AbortController>` is a side-channel

`compose.ts:39`. The HTTP layer reaches into a shared mutable map (`runs.routes.ts:49,64,72,79`) to coordinate cancellation with the executor. That's not bootstrap concern — it's a cancellation registry that belongs in `RunExecutor` (or a tiny `RunCancellation` service in core). Today the route both writes to it on start and reads on cancel; the executor also clears it via `onComplete`. **Three owners of one map is a bug breeding ground.**

### 4. `bootstrap` hard-imports `@harness/mastra` — clone-and-own invariant broken

`packages/bootstrap/src/compose.ts:18` imports `@harness/mastra/capabilities` directly. CLAUDE.md invariant #9 says deleting `packages/mastra/` must leave `core + http + bootstrap` building. Today, deleting mastra breaks bootstrap.

**Fix:** `composeHarness()` should accept the registry as a parameter.

```ts
composeHarness({ capabilityRegistry, logLevel })
```

Caller (`apps/api`, `apps/cli`) imports mastra and passes the registry in.

---

## Genuine simplifications

### 5. Delete the `Tracer` abstraction

`packages/core/src/observability/tracer.ts` (23 LOC) + `tracer.test.ts` (28 LOC). `tracer.startSpan(` is **never called** — it's just passed into `RunExecutor` and forgotten. CLAUDE.md lists `@opentelemetry/api` in the stack but no integration exists.

**Decision:** Delete now (preferred — it's a starter; users add OTel when they need it), or wire one real span around the run lifecycle and keep it honest.

### 6. Deduplicate model-ID parsing

`providers/resolver.ts:4-10` (`providerForModel`) and `providers/model-factory.ts:5-10` both split on `':'` independently.

**Fix:** Extract `parseModelId(id) -> { provider, model }` once. Two callers, one source of truth. ~15 LOC saved.

### 7. Collapse `ApprovalStore` + `ApprovalQueue`

`packages/core/src/storage/memory/approval-{store,queue}.ts`. `ApprovalQueue` holds the in-memory `waiters` map (the only behavior that matters for HITL) and delegates persistence to `ApprovalStore`. They are 1:1 coupled; no other consumer of `ApprovalStore` exists outside the queue and an unused `listPending` (only called in tests).

`waiters` is a process-local concern that *cannot* be persisted anyway — the split doesn't even help with the future durable-store case.

**Fix:** Merge into one `ApprovalCoordinator` with `request/resolve/get/listPending`. Net: ~30 LOC + 1 abstraction removed.

### 8. SSE handler can use `streamSSE`

`runs.routes.ts:124-162` hand-rolls a `ReadableStream` with `\n\n` framing and Last-Event-ID parsing. Hono ships `streamSSE` from `hono/streaming` that does exactly this. ~25 LOC → ~10 LOC, plus back-pressure handling for free.

### 9. `loadProviderKeysFromEnv()` called twice

`composeHarness():62` stores `providerKeys` on deps; `model-factory.ts:11` calls `loadProviderKeysFromEnv()` again at model-construction time. Pick one.

### 10. Index.ts re-export files

`packages/core/src/observability/index.ts` (4 LOC), `providers/index.ts` (6 LOC), `capabilities/runners/index.ts` (4 LOC) are barrels that exist only because subpath imports use `.ts` extensions. Low priority — fold into the package's main `src/index.ts` if reducing files matters.

---

## Things considered and NOT changed

- **Capability registry is hardcoded to 2 entries.** For a clone-and-own template, that's *correct*. Users fork, edit `registry.ts`, ship. A "pluggable registry" with config-driven loading would be premature.
- **`EventBus` interface with one impl.** Borderline, but SSE fan-out semantics are non-trivial (144 LOC handles backpressure, replay-from-seq) — keep as a class with a structural type. The seam is real even if there's only one impl today.
- **`RunExecutor` as a class.** It owns mutable state (subscribers, completion callbacks). Class is the right shape.

---

## Folder & architecture restructuring

The current layout is mostly correct. These are targeted moves, not a rewrite.

### A. Reorganize `packages/core/src/`

Current:

```
packages/core/src/
├── domain/           ← Run, SessionEvent, Capability, Approval, Conversation
├── runs/             ← startRun, cancelRun, approveRun, executor, streamRunEvents
├── conversations/
├── settings/
├── capabilities/     ← types only (CapabilityRegistry interface)
├── storage/memory/   ← all 7 stores in one folder
├── providers/
├── observability/
├── time/
├── memory/
├── runtime/
└── testing/
```

Proposed:

```
packages/core/src/
├── domain/                  ← unchanged: pure types + Run aggregate
├── features/                ← rename from "use cases" — matches CLAUDE.md "feature folders"
│   ├── runs/
│   ├── conversations/
│   ├── settings/
│   └── capabilities/
├── storage/                 ← flatten: drop the `memory/` subfolder
│   ├── run-store.ts         (interface + in-memory impl colocated, as today)
│   ├── event-log.ts
│   ├── event-bus.ts
│   ├── approval.ts          (merged store+queue from issue #7)
│   ├── conversation-store.ts
│   └── settings-store.ts
├── infra/                   ← group infrastructure that isn't storage
│   ├── providers/
│   ├── observability/       (or delete tracer per #5)
│   ├── clock.ts             (was time/)
│   └── id-gen.ts
└── testing/                 ← unchanged
```

**Why:**
- The `storage/memory/` nesting implies "swap to `storage/postgres/`" which isn't the intended pattern — implementations are meant to live next to their interface in the same file. Flatten it.
- `features/` (or keep `runs/`/`conversations/` at top level) makes the use-case layer explicit. Right now `runs/` and `domain/` look like peers but `runs/` is a layer up.
- Tiny standalone folders (`time/`, `memory/`, `runtime/`) add navigation overhead. Group as `infra/`.

### B. `packages/mastra/` is fine, but tighten the `runners/` boundary

`packages/mastra/src/capabilities/runners/agent-runner.ts` and `workflow-runner.ts` are the only mastra→core seam that does runtime translation (Mastra chunks → `StreamEventPayload`). That's worth highlighting:

```
packages/mastra/src/
├── agents/
├── tools/
├── workflows/
├── adapters/                ← rename from "runners"
│   ├── agent-adapter.ts     (was agent-runner.ts)
│   ├── workflow-adapter.ts
│   └── stream-mapping.ts    (extract chunk → StreamEventPayload mapping)
└── capabilities/            ← unchanged: thin compositions
```

"Adapter" names what these files actually do (translate between Mastra and core's stream protocol). The shared chunk-mapping function should be extracted; today both runners duplicate the small mapping switch.

### C. `packages/http/src/` — separate route shape from wiring

Current:

```
packages/http/src/
├── routes/
│   ├── runs.routes.ts
│   ├── runs.schemas.ts
│   ├── ...
├── middleware/
├── types/
├── app.ts
└── deps.ts
```

Proposed (incremental):

```
packages/http/src/
├── routes/
│   ├── runs/
│   │   ├── index.ts         (router export)
│   │   ├── schemas.ts
│   │   └── handlers.ts      (pure functions: deps + parsed input → result)
│   ├── conversations/
│   └── ...
├── middleware/
├── types/
├── app.ts
└── deps.ts
```

**Why:** Today `runs.routes.ts` (165 LOC) mixes Hono wiring, OpenAPI metadata, business glue, and the SSE stream framing. Splitting `handlers.ts` (testable in isolation) from `index.ts` (Hono-specific) makes route tests trivial without spinning up an HTTP layer. **Optional** — only worth it if route count grows. At 6 routes, current shape is fine.

### D. New package: `packages/contracts/` (only if `apps/console` grows)

Today `apps/console` imports `@harness/http/types`. If the SPA stays small, no change. If you add a second client (mobile, CLI dashboard, third-party SDK), extract the wire schemas (Zod) to a leaf package both http and clients import:

```
packages/contracts/    ← Zod schemas for request/response bodies + DTOs
└── src/
    ├── runs.ts
    ├── capabilities.ts
    └── ...
```

`http` defines routes against `contracts`; `console` validates server responses against the same schemas. **Don't do this yet** — wait for the second consumer.

### E. Apps layout — fine as-is

`apps/api` (~27 LOC), `apps/cli` (33 LOC), `apps/console` (~6.4k LOC) — proportions are right. `apps/cli` earns its keep as the proof-of-layering.

---

## Suggested order

Architectural correctness:

1. **#1** DELETE-route invariant fix.
2. **#4** `composeHarness` accepts registry — restores clone-and-own.
3. **#2** Replace `ReturnType<...>` in `HarnessDeps` with structural interfaces.
4. **#3** Move abort-controller map into executor.

Weight reduction:

5. **#5** Delete tracer.
6. **#7** Merge approval store + queue.
7. **#6, #8, #9** Cleanup batch.

Restructuring (do after the issues above land, not before):

8. **A** Flatten `storage/memory/` and group `infra/`.
9. **B** Rename `runners/` → `adapters/`, extract shared chunk mapping.

Each is independently mergeable. Items 1–4 are architectural; 5–9 reduce surface area; A–B are cosmetic but improve onboarding.
