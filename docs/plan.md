## Implementation Plan: Platform Redesign (from scratch)

**Status:** Draft · **Owner:** @tien · **Date:** 2026-04-24
**Supersedes:** the "Variant A" plan (previous revision of this file). The prior plan migrated the existing structure; this one rebuilds around clean contracts because the current streaming/session/router patterns have inherited anti-patterns that aren't worth preserving.

---

## Overview

Rebuild the harness as a hexagonal, event-sourced agentic platform with HTTP APIs, using **in-memory stores** initially. The `Capability` runtime is pluggable (Mastra is one adapter, not a hard dependency). Postgres is the target durable store but deferred to a follow-up phase — the port/adapter split means swapping InMemory → Postgres is mechanical.

Simplifications adopted in this revision:
- **In-memory storage first.** All stores (runs, events, conversations, settings, approvals) are in-memory. Data resets on restart — acceptable for dev. Postgres follow-up adds durability without domain changes.
- **No multi-tenancy.** No `tenant_id` columns, no `AuthPort`, no auth middleware. Single-tenant by default. Tenancy is a follow-up that adds a column + middleware + predicate filters — no domain changes needed because ports are narrow.
- **No `/v1` URL prefix for now.** Routes are just `/runs`, `/capabilities`, etc. Versioning is a follow-up concern when a breaking change is actually needed; the app factory reserves the ability to mount under a prefix later.

The new system is built alongside `apps/web-studio` in new packages. At the cutover phase, the React UI is moved onto the new API and `apps/web-studio` is deleted.

### Constraints carried over

- Bun workspaces, TypeScript 5.7 strict, Zod v4, Biome 2.4, Lefthook.
- Clone-and-own invariant (no npm publish).
- `bun run ci` must stay green after every task.
- Mastra primitives (`@harness/tools`, `@harness/agents`, `@harness/workflows`) are kept — they are Mastra building blocks that the Mastra adapter composes.

### Answers to open questions (confirmed)

1. Direction: hexagonal + event-sourced HTTP. **Confirmed.**
2. Auth/tenancy: **deferred.** Not in this plan. Follow-up adds ports + middleware.
3. Database: **in-memory first.** Postgres follow-up is planned but not blocking.
4. Capability runtime: **pluggable**. Mastra lives in `@harness/adapters/mastra`; `Capability<I, O>` has zero Mastra coupling.
5. URL versioning: **deferred**. No `/v1` prefix yet.
6. Primary keys: **`crypto.randomUUID()`** for now. UUIDv7 (time-ordered) when Postgres is added.

---

## Architecture

### Layers (hexagonal)

```
┌────────────────────────────────────────────────────────────────┐
│ Transports         HTTP (REST + SSE) · MCP (future) · WS (later)│
├────────────────────────────────────────────────────────────────┤
│ Application        StartRun · StreamRunEvents · ApproveRun ·    │
│ (use cases)        CancelRun · ListCapabilities · Settings ·    │
│                    Conversations                                │
├────────────────────────────────────────────────────────────────┤
│ Domain             Run (aggregate) · SessionEvent (tagged union)│
│                    Capability<I,O> · Conversation · Approval    │
├────────────────────────────────────────────────────────────────┤
│ Ports (interfaces) RunStore · EventLog · EventBus · ApprovalStore│
│                    MemoryProvider · ProviderResolver ·           │
│                    Clock · IdGen · Logger · Tracer              │
├────────────────────────────────────────────────────────────────┤
│ Adapters           InMemory (all stores + bus + approval)       │
│                    Mastra (capabilities) · Pino (logger)        │
│                    Crypto (id) · System (clock)                 │
└────────────────────────────────────────────────────────────────┘
```

**Key property:** every arrow points inward. Domain and application have zero runtime dependencies except `zod`. All "real" code (Mastra, Hono, pino) is in adapters and is swappable.

### Package DAG

```
packages/
  tools/  agents/  workflows/         (Mastra primitives — unchanged)
        ↑           ↑
        └───────────┤
                    │
  adapters/  ←──  capabilities/  ──→  core/
     ↑                                 ↑
     └────────────────────┐            │
                          │            │
                        http/  ←───────┘
                          ↑
                        apps/api
                        apps/console   (HTTP types only)
                        mastra.config.ts

core/          zero deps outside zod. Domain + ports + use cases.
adapters/      implements ports. In-memory stores, Mastra, pino, OTel, etc.
capabilities/  capability definitions. Uses adapters/mastra helpers; imports core for Capability interface.
http/          Hono + middleware + routes + OpenAPI + typed DTOs.
apps/api       composition root. Wires config → adapters → capabilities → http.
apps/console   React SPA. Imports only @harness/http/types for DTO shapes.
```

### Tech additions

| Concern | Choice | Why |
|---|---|---|
| Storage | In-memory (Map-based) | Zero setup, fast tests, swap to Postgres later via ports |
| Keys | `crypto.randomUUID()` | Built-in, no deps. UUIDv7 added with Postgres. |
| Logger | pino | Structured, fast, standard |
| Tracing | `@opentelemetry/api` interface; no exporter wired yet | Stub now, Langfuse/OTLP exporter later |
| Schema-to-OpenAPI | `@asteasolutions/zod-to-openapi` or `hono-openapi` | Generate spec from Zod |

New runtime deps: `pino`, `@opentelemetry/api`. Dev deps: none added.

---

## Domain model

### `Capability<I, O>` — pluggable interface

```ts
export interface Capability<I = unknown, O = unknown> {
  readonly id: string;
  readonly title: string;
  readonly description: string;

  /** Input shape validated at the app boundary. Separate from settings. */
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  /** Tunable configuration (model, temperature, depth, etc.). */
  readonly settingsSchema: z.ZodType;

  /** Optional: declares HITL checkpoints this capability may produce. */
  readonly supportsApproval?: boolean;

  execute(input: I, ctx: ExecutionContext): AsyncIterable<CapabilityEvent>;
}

export interface ExecutionContext {
  runId: string;
  settings: unknown;            // pre-parsed by settings schema
  memory: MemoryHandle | null;  // from MemoryProvider port
  signal: AbortSignal;
  approvals: ApprovalRequester; // port, scoped to this run
  logger: Logger;               // port, scoped to this run
}

/** Capability-level events (no framework concepts). Runner maps these to SessionEvent. */
export type CapabilityEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-called'; tool: string; args: unknown; callId: string }
  | { type: 'tool-result'; callId: string; result: unknown }
  | { type: 'step-finished'; usage?: TokenUsage }
  | { type: 'plan-proposed'; plan: unknown }
  | { type: 'artifact'; name: string; data: unknown } // generic typed artifact
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'custom'; kind: string; data: unknown };
```

Mastra-specific chunks are translated by `@harness/adapters/mastra/event-mapper.ts` into `CapabilityEvent`. Non-Mastra capabilities yield `CapabilityEvent` directly.

### `SessionEvent` — the wire contract

Runner wraps each `CapabilityEvent` with run-level metadata into a `SessionEvent`:

```ts
const BaseEvent = z.object({
  runId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  ts: z.string().datetime(),      // ISO8601
});

export const SessionEvent = z.discriminatedUnion('type', [
  BaseEvent.extend({ type: z.literal('run.started'), capabilityId: z.string(), input: z.unknown() }),
  BaseEvent.extend({ type: z.literal('text.delta'), text: z.string() }),
  BaseEvent.extend({ type: z.literal('reasoning.delta'), text: z.string() }),
  BaseEvent.extend({ type: z.literal('tool.called'), tool: z.string(), args: z.unknown(), callId: z.string() }),
  BaseEvent.extend({ type: z.literal('tool.result'), callId: z.string(), result: z.unknown() }),
  BaseEvent.extend({ type: z.literal('step.finished'), usage: TokenUsage.optional() }),
  BaseEvent.extend({ type: z.literal('plan.proposed'), plan: z.unknown() }),
  BaseEvent.extend({ type: z.literal('approval.requested'), approvalId: z.string(), payload: z.unknown() }),
  BaseEvent.extend({ type: z.literal('approval.resolved'), approvalId: z.string(), decision: ApprovalDecision }),
  BaseEvent.extend({ type: z.literal('artifact'), name: z.string(), data: z.unknown() }),
  BaseEvent.extend({ type: z.literal('usage'), usage: TokenUsage }),
  BaseEvent.extend({ type: z.literal('run.completed'), output: z.unknown() }),
  BaseEvent.extend({ type: z.literal('run.failed'), error: ErrorShape }),
  BaseEvent.extend({ type: z.literal('run.cancelled'), reason: z.string().optional() }),
]);
```

This schema is exported from `@harness/http/types` and published as the client contract. Clients get exhaustive switch statements, no more `{ type: string; [k: string]: unknown }`.

### `Run` — state machine aggregate

```ts
type RunStatus = 'pending' | 'running' | 'suspended' | 'completed' | 'failed' | 'cancelled';

class Run {
  // Transitions (only legal paths):
  //   pending → running
  //   running → {suspended, completed, failed, cancelled}
  //   suspended → {running, cancelled}
  //
  // Emits events; host calls event log + bus publish.

  start(input: unknown): RunStartedEvent;
  append(e: CapabilityEvent): SessionEvent;
  suspendForApproval(approvalId: string, payload: unknown): ApprovalRequestedEvent;
  resumeFromApproval(decision: ApprovalDecision): ApprovalResolvedEvent;
  complete(output: unknown): RunCompletedEvent;
  fail(err: AppError): RunFailedEvent;
  cancel(reason?: string): RunCancelledEvent;
}
```

All state mutation goes through `Run`. No route, no capability, no adapter calls `runStore.update({status: ...})` directly. This is the fix for the "session lifecycle is implicit" smell.

### Streaming model

```
Capability.execute() yields CapabilityEvent
       │
       ▼
RunExecutor (application service)
       │
       ├─► Run.append(e)                 # state transition + wrap as SessionEvent
       ├─► EventLog.append(sessionEvent) # durable (in-memory; Postgres later)
       ├─► EventBus.publish(sessionEvent)# live fanout (in-memory)
       └─► RunStore.projectRun(run)      # update read-model row
```

`GET /runs/:id/events` (SSE):

```
1. Parse Last-Event-ID header → fromSeq
2. Read EventLog from fromSeq upward (catchup)
3. Subscribe to EventBus from current tail, merged with dedup on (runId, seq)
4. Stream SessionEvents as SSE `event: session; id: <seq>; data: <JSON>`
5. End on run.completed / run.failed / run.cancelled
```

Works across SSE reconnects. When Postgres is added, this also works across process restarts.

---

## Package map (target end-state)

```
packages/
  tools/ agents/ workflows/           (Mastra primitives, unchanged)

  core/                               @harness/core — domain + ports + use cases
    src/
      domain/
        run.ts
        session-event.ts              # zod discriminated union
        capability.ts
        approval.ts
        conversation.ts
        errors.ts
      app/
        start-run.ts
        stream-run-events.ts
        approve-run.ts
        cancel-run.ts
        list-capabilities.ts
        get-capability.ts
        list-conversations.ts
        get-settings.ts
        update-settings.ts
        run-executor.ts               # the orchestrator described above
      ports/
        run-store.ts
        event-log.ts
        event-bus.ts
        approval-store.ts
        memory-provider.ts
        provider-resolver.ts
        capability-registry.ts
        clock.ts
        id-gen.ts
        logger.ts
        tracer.ts
      index.ts

  adapters/                           @harness/adapters — port implementations
    src/
      inmem/
        run-store.ts
        event-log.ts
        event-bus.ts
        approval-store.ts
        approval-queue.ts             # wraps ApprovalStore with in-process promise waiters
        conversation-store.ts
        settings-store.ts
      mastra/
        from-agent.ts                 # MastraAgent → Capability
        from-workflow.ts              # MastraWorkflow → Capability
        event-mapper.ts               # Mastra chunk → CapabilityEvent
        memory-provider.ts
        singleton.ts                  # process-level Mastra instance
      providers/
        resolver.ts                   # Google/Groq/OpenRouter/Ollama
        catalog.ts
      observability/
        pino-logger.ts
        otel-tracer.ts                # stubbed no-op + ready to wire
      identity/
        system-clock.ts
        crypto-id-gen.ts              # crypto.randomUUID()

  capabilities/                       @harness/capabilities
    src/
      simple-chat/
        capability.ts                 # uses fromMastraAgent + @harness/agents
        settings.ts
        input.ts
      deep-research/
        capability.ts                 # uses fromMastraWorkflow + @harness/workflows
        settings.ts
        input.ts
      registry.ts                     # export const capabilities = {...}
      index.ts

  http/                               @harness/http
    src/
      app.ts                          # createHttpApp(deps): Hono
      middleware/
        error-handler.ts
        request-id.ts
        logger.ts
        cors.ts
        body-limit.ts
      routes/
        runs.routes.ts
        events.routes.ts              # SSE
        approvals.routes.ts
        capabilities.routes.ts
        settings.routes.ts
        conversations.routes.ts
        models.routes.ts
        health.routes.ts
      types/                          # public DTOs (clients import these)
        session-event.ts              # re-export from core
        dto.ts
        index.ts
      openapi.ts

apps/
  api/                                composition root; Bun entry
    src/
      index.ts
      config.ts
      compose.ts

  console/                            React SPA (renamed from web-studio)
    src/
      api/                            # typed HTTP client
      hooks/
      components/
      ...

mastra.config.ts                      imports capabilities registry
```

---

## Task List

Nine phases, twenty tasks. The new system is built alongside `apps/web-studio`, which keeps working until Phase 7 cuts over.

---

### Phase 0 — Infrastructure & scaffolding

#### Task 0.1: Empty package scaffolding + Biome DAG

**Description:** Create empty workspace packages (`@harness/core`, `@harness/adapters`, `@harness/capabilities`, `@harness/http`, `apps/api`, `apps/console`) with `package.json`, `tsconfig.json`, `src/index.ts`. Add Biome `noRestrictedImports` rules enforcing the DAG inward.

**Acceptance criteria:**
- [ ] Six new workspace members, each with `package.json` (correct name, deps declared), `tsconfig.json` (extends base), `src/index.ts` (`export {};`).
- [ ] Dep declarations (strict inward DAG):
  - `core`: only `zod`.
  - `adapters`: `core`, `pino`, `@mastra/core`, `@mastra/libsql`, `@mastra/memory`, `ollama-ai-provider-v2`, `@harness/agents`, `@harness/workflows`.
  - `capabilities`: `core`, `adapters`, `@harness/agents`, `@harness/workflows`, `@harness/tools`.
  - `http`: `core`, `hono`, `zod`.
  - `apps/api`: `core`, `adapters`, `capabilities`, `http`.
  - `apps/console`: `react`, `react-dom`, `@tanstack/react-query`, `react-markdown`, `@harness/http` (types only).
- [ ] `biome.json` `noRestrictedImports` rules:
  - `packages/core/**` cannot import from `@harness/adapters`, `@harness/http`, `@harness/capabilities`, `apps/**`.
  - `packages/adapters/**` cannot import from `@harness/http`, `@harness/capabilities`, `apps/**`.
  - `packages/capabilities/**` cannot import from `@harness/http`, `apps/**`.
  - `packages/http/**` cannot import from `apps/**`, `@harness/capabilities`, `@harness/adapters`.
  - `apps/console/**` can only reach `@harness/*` via `@harness/http/types`.
  - Legacy `apps/web-studio/**` unconstrained (cleaned up in Phase 7).

**Verification:**
- [ ] `bun install` clean.
- [ ] `bun run ci` green.
- [ ] Manual: throwaway import violation triggers Biome error; revert.

**Files likely touched:** ~18 files (3 files × 6 packages) + `biome.json`.

**Scope:** Medium.

### Checkpoint: Phase 0
- [ ] `bun run ci` green.
- [ ] Packages scaffolded; DAG enforced.
- [ ] `apps/web-studio` unchanged and still works.
- [ ] Human review.

---

### Phase 1 — Domain core (pure, no runtime deps)

#### Task 1.1: Domain types — Run, SessionEvent, Capability

**Description:** Define the core domain in `@harness/core`: `SessionEvent` discriminated union (Zod), `Capability<I, O>` interface, `Run` aggregate with transition methods, `Approval`, `Conversation`, `AppError` types. Pure TypeScript + Zod only.

**Acceptance criteria:**
- [ ] `packages/core/src/domain/session-event.ts` — Zod discriminated union covering all variants listed in "Domain model" above; export both schema and inferred type.
- [ ] `packages/core/src/domain/capability.ts` — `Capability<I, O>` interface, `ExecutionContext`, `CapabilityEvent` union.
- [ ] `packages/core/src/domain/run.ts` — `Run` class with state machine; illegal transitions throw `InvalidRunStateError`. Emits events; does NOT write to any store.
- [ ] `packages/core/src/domain/approval.ts` — `ApprovalDecision` (`{kind: 'approve', editedPlan?} | {kind: 'reject', reason?}`), `PendingApproval`.
- [ ] `packages/core/src/domain/conversation.ts` — value object.
- [ ] `packages/core/src/domain/errors.ts` — `AppError` hierarchy: `ValidationError`, `NotFoundError`, `ConflictError`, `InvalidRunStateError`, `CapabilityExecutionError`, `ExternalServiceError`.
- [ ] Unit tests for `Run` state machine (all legal + illegal transitions).
- [ ] Unit tests for `SessionEvent` schema (round-trip all variants).

**Verification:**
- [ ] `bun test packages/core/src/domain` — all tests pass.
- [ ] `bun run typecheck` green.
- [ ] Zero runtime deps beyond `zod` in `packages/core/package.json`.

**Files likely touched:** ~10 source + ~3 test files.

**Scope:** Medium.

---

#### Task 1.2: Ports

**Description:** Define all port interfaces in `packages/core/src/ports/`. Pure interfaces, no implementations.

**Acceptance criteria:**
- [ ] `run-store.ts`: `create`, `get(id)`, `list(filter)`, `updateStatus`, `delete`.
- [ ] `event-log.ts`: `append(event)`, `read(runId, fromSeq?, toSeq?)`, `lastSeq(runId)`. Monotonic, gap-free per run.
- [ ] `event-bus.ts`: `publish(event)`, `subscribe(runId, fromSeq?): AsyncIterable<SessionEvent>`, `close(runId)`.
- [ ] `approval-store.ts`: `createPending`, `resolve`, `get`, `listPending`.
- [ ] `memory-provider.ts`: `forConversation(conversationId): MemoryHandle | null`.
- [ ] `provider-resolver.ts`: `resolve(modelId, providerKeys): ModelConfig`, `list(keys): ModelEntry[]`.
- [ ] `capability-registry.ts`: `list()`, `get(id): Capability | null`.
- [ ] `clock.ts`, `id-gen.ts`, `logger.ts`, `tracer.ts`.
- [ ] Barrel `index.ts` re-exporting all ports.

**Verification:**
- [ ] `bun run typecheck` green.
- [ ] No imports from `@harness/adapters` in any file under `packages/core` (Biome DAG).

**Files likely touched:** ~12 files.

**Scope:** Medium.

---

#### Task 1.3: Application use cases (skeleton with TDD)

**Description:** Implement the use cases that orchestrate ports. Each is a small class or function taking a `deps` object (injected ports). Heavy test coverage with port fakes (provided by `@harness/core/testing`).

**Acceptance criteria:**
- [ ] `start-run.ts` — creates Run aggregate, persists, kicks off `RunExecutor` in a task, returns `{ runId }`. Does NOT await completion.
- [ ] `run-executor.ts` — the orchestrator: iterates `capability.execute()`, wraps each `CapabilityEvent` into `SessionEvent` via `Run.append`, calls `EventLog.append` + `EventBus.publish`. Handles abort, approval suspension, final state transitions.
- [ ] `stream-run-events.ts` — returns merged catchup (EventLog) + live (EventBus) `AsyncIterable<SessionEvent>` for a runId; respects `fromSeq` (Last-Event-ID).
- [ ] `approve-run.ts` — validates pending approval, calls `ApprovalStore.resolve`, triggers `Run.resumeFromApproval`.
- [ ] `cancel-run.ts` — sets cancel signal, calls `Run.cancel`, publishes event.
- [ ] `list-capabilities.ts`, `get-capability.ts` — query registry.
- [ ] `list-conversations.ts`, `get-conversation.ts`.
- [ ] `get-settings.ts`, `update-settings.ts` — layered resolver (defaults → scoped store → request override).
- [ ] `packages/core/src/testing/` provides `FakeEventLog`, `FakeEventBus`, `FakeRunStore`, `FakeApprovalStore`, `FakeClock`, `FakeIdGen` — in-memory, deterministic.
- [ ] Unit tests cover every use case with fakes (golden path + error paths).

**Verification:**
- [ ] `bun test packages/core/src/app` — all pass.
- [ ] `RunExecutor` test: event sequence for a successful capability matches a snapshot.
- [ ] `RunExecutor` test: abort mid-stream produces exactly one `run.cancelled` event and no further events.
- [ ] `ApproveRun` + `StreamRunEvents` integration: SSE reconnect after seq 5 resumes at seq 6.

**Files likely touched:** ~12 source + ~12 test files.

**Scope:** Large — break into sub-tasks if needed, but treat as one reviewable unit since the use cases depend on each other.

### Checkpoint: Phase 1
- [ ] `@harness/core` is a complete, testable, framework-free library.
- [ ] `bun test packages/core` green; 100% use case coverage.
- [ ] `bun run ci` green.
- [ ] Human review of the domain contract before building adapters (this is the shape for the next 6 months — get it right).

---

### Phase 2 — Infrastructure adapters

#### Task 2.1: In-memory stores

**Description:** Implement `InMemoryRunStore`, `InMemoryEventLog`, `InMemorySettingsStore`, `InMemoryApprovalStore`, `InMemoryConversationStore`. Each implements the corresponding port from `@harness/core/ports`. All Map-based, data lives for the process lifetime.

**Acceptance criteria:**
- [ ] Each store is a factory function returning an object satisfying the port.
- [ ] `InMemoryEventLog.append` produces gap-free, monotonic `seq` per run.
- [ ] `InMemoryRunStore.create` generates id via `IdGen` port (crypto.randomUUID).
- [ ] Unit tests for each store: CRUD + edge cases (not found, duplicate, etc.).
- [ ] Stores are fast enough for tests — no async delays.

**Verification:**
- [ ] `bun test packages/adapters/src/inmem` green.
- [ ] `bun run ci` green.

**Files likely touched:** 5 source + 5 test files.

**Scope:** Medium.

---

#### Task 2.2: EventBus + ApprovalQueue + system adapters

**Description:** Implement `InMemoryEventBus`, `InMemoryApprovalQueue` (wraps `ApprovalStore` + in-process promise coordination), `SystemClock`, `CryptoIdGen`, `PinoLogger`, `NoOpTracer`.

**Acceptance criteria:**
- [ ] `inmem/event-bus.ts` — ring-buffer per runId with subscribers; drops runId on close. Async-safe with pending-promise pattern, matching current `RunBroadcast` semantics cleaned up.
- [ ] `inmem/approval-queue.ts` — persists via injected `ApprovalStore`, but also holds an in-process `Map<approvalId, PromiseResolver>` for live-waiting `request()` calls.
- [ ] `observability/pino-logger.ts` — structured logger with `child({ runId, requestId })` composition.
- [ ] `observability/otel-tracer.ts` — uses `@opentelemetry/api` NoopTracer by default; ready to be swapped for real exporter.
- [ ] `identity/system-clock.ts`, `identity/crypto-id-gen.ts`.
- [ ] Unit tests for EventBus (subscribe before publish, multiple subscribers, close mid-stream) and ApprovalQueue (resolve before/after `request()`).

**Verification:**
- [ ] `bun test packages/adapters/src/inmem packages/adapters/src/identity packages/adapters/src/observability` green.
- [ ] `bun run ci` green.

**Files likely touched:** ~8 source + ~5 test files.

**Scope:** Medium.

---

#### Task 2.3: Mastra adapter

**Description:** Implement `fromMastraAgent(agent, config): Capability` and `fromMastraWorkflow(workflow, config): Capability`. These are the bridge — they take Mastra primitives and produce `Capability<I, O>` implementations. Translate Mastra stream chunks into `CapabilityEvent` via `event-mapper.ts`. Use a process-level Mastra singleton with shared storage (env-driven).

**Acceptance criteria:**
- [ ] `packages/adapters/src/mastra/singleton.ts` — single Mastra instance per process, lazy-initialized with all registered workflows; storage configured via env.
- [ ] `from-agent.ts`:
  - Takes a Mastra `Agent` factory + capability metadata (`id`, `title`, settingsSchema, etc.).
  - Returns a `Capability` whose `execute()` calls `agent.stream(...)`, translates chunks via `event-mapper`, yields `CapabilityEvent`s.
  - Handles `abortSignal` propagation.
  - Integrates `MemoryProvider` port → Mastra Memory config.
- [ ] `from-workflow.ts`:
  - Same pattern for workflow; supports `suspend`/`resume` by yielding `plan-proposed` + invoking `ctx.approvals.request()` + calling `run.resume()`.
  - The approval round-trip is fully handled inside the capability; `RunExecutor` just sees an `AsyncIterable<CapabilityEvent>` that happens to await mid-stream.
- [ ] `event-mapper.ts` — pure function mapping a Mastra stream chunk (typed) to a `CapabilityEvent`; unknown chunk types become `{type: 'custom', kind, data}`.
- [ ] `memory-provider.ts` — creates Mastra `Memory` from `@mastra/memory` + LibSQL store (keeps conversation memory in its own LibSQL file — NOT in the main stores; Mastra memory is an internal detail).
- [ ] Tests:
  - `fromMastraAgent` with `mockModel()` from `@harness/agents/testing` produces expected CapabilityEvents.
  - `fromMastraWorkflow` with a stubbed workflow that suspends produces `plan-proposed` → awaits `approvals.request` → yields downstream events on resume.

**Verification:**
- [ ] `bun test packages/adapters/src/mastra` green.
- [ ] `bun run ci` green.

**Files likely touched:** ~6 source + ~4 test files.

**Scope:** Large (this is the critical adapter — get the abstraction right).

---

#### Task 2.4: Provider resolver adapter

**Description:** Port the current `infra/llm.ts` logic (Google, Groq, OpenRouter, Ollama) into `packages/adapters/src/providers/`, behind `ProviderResolver` port.

**Acceptance criteria:**
- [ ] `resolver.ts` implements `ProviderResolver`.
- [ ] `catalog.ts` holds `knownModels` (copied from current `llm.ts`).
- [ ] Env-based key loading (`loadProviderKeysFromEnv`) lives in `adapters/providers/env-keys.ts`.
- [ ] `listAvailableModels(keys)` behaves identically to current implementation.

**Verification:**
- [ ] Unit tests confirm parity with current behavior (snapshot on `listAvailableModels`).
- [ ] `bun run ci` green.

**Files likely touched:** 3 source + 1 test.

**Scope:** Small.

### Checkpoint: Phase 2
- [ ] All adapters implemented and tested in isolation.
- [ ] In-memory stores cover all ports; data is ephemeral (acceptable for dev).
- [ ] In-memory EventBus concurrency test passes.
- [ ] Mastra adapter bridges agents + workflows to `Capability`.
- [ ] `bun run ci` green.
- [ ] Human review before building capabilities on top.

---

### Phase 3 — First vertical slice: simple-chat end-to-end

#### Task 3.1: simple-chat capability

**Description:** Author `@harness/capabilities/simple-chat` using `fromMastraAgent` + `@harness/agents/simpleChatAgent`. Define explicit `inputSchema` (separate from settings).

**Acceptance criteria:**
- [ ] `packages/capabilities/src/simple-chat/capability.ts` exports `simpleChatCapability: Capability<SimpleChatInput, SimpleChatOutput>`.
- [ ] `inputSchema`: `{ message: string, conversationId?: string }`.
- [ ] `settingsSchema`: matches current (`model`, `systemPrompt`, `maxTurns`).
- [ ] Capability test: via `mockModel()`, a sample input produces expected `CapabilityEvent` sequence (mirrors current `simple-chat.test.ts`).

**Verification:**
- [ ] `bun test packages/capabilities/src/simple-chat` green.

**Files likely touched:** 3 source + 2 test.

**Scope:** Small.

---

#### Task 3.2: Capability registry

**Description:** `packages/capabilities/src/registry.ts` exports `createCapabilityRegistry(deps): CapabilityRegistry` — a factory that takes adapter deps (Mastra singleton, provider resolver) and returns an implementation of the `CapabilityRegistry` port.

**Acceptance criteria:**
- [ ] `createCapabilityRegistry` returns `{ list(), get(id) }`.
- [ ] Registry includes `simple-chat` for now; `deep-research` added in Phase 4.
- [ ] Used by `ListCapabilitiesUseCase`.

**Verification:**
- [ ] Registry test: `list()` returns simple-chat; `get('simple-chat')` returns it; `get('unknown')` returns null.

**Files likely touched:** 1 source + 1 test.

**Scope:** Small.

---

#### Task 3.3: HTTP app factory + core middleware

**Description:** Build `createHttpApp(deps, config): Hono` in `packages/http/src/app.ts` with essential middleware: error handler, request ID, CORS, body limit, structured logger.

**Acceptance criteria:**
- [ ] `error-handler.ts` maps `AppError` subclasses to correct HTTP status (400, 404, 409, 500); non-AppError throws → 500 with generic message (no internals leaked).
- [ ] `request-id.ts` generates UUID per request, sets `X-Request-ID` header.
- [ ] `logger.ts` logs structured access line on response.
- [ ] `cors.ts`, `body-limit.ts` — ported from current.
- [ ] `app.ts` mounts routes at the root (no version prefix). Factory accepts an optional `basePath` option for future `/v1` mounting, but default is unprefixed.
- [ ] Contract test: 404 on unknown route; 500 on thrown error returns opaque body + real error in logs.

**Verification:**
- [ ] `bun test packages/http/src/middleware` green.

**Files likely touched:** 6 source + 3 test.

**Scope:** Medium.

---

#### Task 3.4: `/runs`, `/events`, `/capabilities`, `/health` routes

**Description:** First four route modules. Each route body is ≤20 lines: parse Zod → call use case → serialize.

**Acceptance criteria:**
- [ ] `POST /runs` — body `{ capabilityId, input, settings?, conversationId? }`; returns `{ runId }`. Fires-and-forgets execution (RunExecutor runs in background task).
- [ ] `GET /runs/:id` — returns Run projection.
- [ ] `DELETE /runs/:id` — cancels + deletes run + events.
- [ ] `POST /runs/:id/cancel` — cancel without delete.
- [ ] `GET /runs/:id/events` (SSE) — reads from `StreamRunEventsUseCase`; supports `Last-Event-ID`; emits `event: session`, `id: <seq>`, `data: <JSON>`; closes on terminal event.
- [ ] `GET /capabilities` — list.
- [ ] `GET /capabilities/:id` — detail (includes JSON Schema for inputSchema + settingsSchema).
- [ ] `GET /health` — returns `{ status: 'ok' }`.
- [ ] Each route has request validation via Zod schema (shared with DTO types in `@harness/http/types`).
- [ ] Contract tests for each route using `app.request(...)` (Hono test harness) with in-memory ports (FakeRunStore etc. from `@harness/core/testing`).

**Verification:**
- [ ] `bun test packages/http/src/routes` green with fake ports.
- [ ] SSE test: `Last-Event-ID: 3` resumes at seq 4; stream ends on `run.completed`.

**Files likely touched:** 4 route source + 4 test + DTO schema files.

**Scope:** Large.

---

#### Task 3.5: Compose + `apps/api` + first live run

**Description:** Wire everything in `apps/api/src/compose.ts`: load config, instantiate all in-memory adapters, build capability registry, construct use cases, mount HTTP app. `apps/api/src/index.ts` calls `compose()` and `Bun.serve(...)`.

**Acceptance criteria:**
- [ ] `apps/api/src/config.ts` parses env with Zod into a typed `Config`.
- [ ] `apps/api/src/compose.ts` — deterministic wiring, returns `{ app: Hono, shutdown: () => Promise<void> }`.
- [ ] `apps/api/src/index.ts` — 30 lines: load config, compose, start, attach SIGTERM handler calling shutdown.
- [ ] `apps/api/src/index.test.ts` — end-to-end test: `POST /runs` for simple-chat → `GET /runs/:id/events` SSE → receive `run.started` … `run.completed`.
- [ ] Root `package.json` script `"api": "bun run --filter @harness/example-api dev"`.

**Verification:**
- [ ] `bun run api` — server starts on 3000.
- [ ] Manual: `curl -X POST http://127.0.0.1:3000/runs -d '{"capabilityId":"simple-chat","input":{"message":"hi"},"settings":{"model":"ollama:qwen2.5:3b"}}'` returns `{runId}`.
- [ ] Manual: `curl -N http://127.0.0.1:3000/runs/<id>/events` streams events to completion.
- [ ] `bun run ci` green.

**Files likely touched:** 4 source + 1 test.

**Scope:** Medium.

### Checkpoint: Phase 3 — FIRST END-TO-END
- [ ] Simple-chat works through new stack: HTTP → use case → capability → Mastra → EventLog → SSE.
- [ ] Old `apps/web-studio` still works in parallel on port 3000 (if running).
- [ ] **This is the critical milestone — the architecture is proven.**
- [ ] Human review before adding HITL.

---

### Phase 4 — Second vertical slice: deep-research + HITL

#### Task 4.1: deep-research capability

**Description:** Author `@harness/capabilities/deep-research` using `fromMastraWorkflow` + `@harness/workflows/deepResearchWorkflow`. The capability internally calls `ctx.approvals.request()` when the workflow suspends after the plan step; resumes the workflow after decision returns.

**Acceptance criteria:**
- [ ] `packages/capabilities/src/deep-research/capability.ts` exports `deepResearchCapability: Capability<DeepResearchInput, DeepResearchOutput>`.
- [ ] `supportsApproval: true`.
- [ ] Internal flow:
  1. Start workflow; yield `step.finished` and `plan.proposed` after plan step.
  2. Call `ctx.approvals.request(approvalId, {plan})`; await decision.
  3. If rejected → throw `CapabilityRejectedError` (maps to `run.cancelled`).
  4. If approved with edits, use edited plan; resume workflow.
  5. Yield downstream events (research, fact-check, report) + `run.completed` with final report as output.
- [ ] Registered in `capabilities/registry.ts`.

**Verification:**
- [ ] Capability test with a scripted `mockModel` proves suspend → approval.request → resume path end-to-end.

**Files likely touched:** 3 source + 2 test.

**Scope:** Medium.

---

#### Task 4.2: Approval routes + HITL end-to-end

**Description:** Add `POST /runs/:id/approve` and `POST /runs/:id/reject`. Each maps to `ApproveRunUseCase` or the reject variant, which calls `ApprovalQueue.resolve`; the capability's awaiting `request()` returns; workflow resumes.

**Acceptance criteria:**
- [ ] `packages/http/src/routes/approvals.routes.ts` with `approve` and `reject` handlers.
- [ ] Body: `{ approvalId, editedPlan? }` for approve; `{ approvalId, reason? }` for reject.
- [ ] Returns 409 if no pending approval for this run; 404 if run not found.
- [ ] Contract test using in-memory ports: run suspends → approve → receives `approval.resolved` + downstream events → `run.completed`.
- [ ] Integration test via `apps/api`: POST run, SSE until `approval.requested`, POST approve, SSE continues to `run.completed`.

**Verification:**
- [ ] `bun test` green.
- [ ] Manual: full HITL flow via curl.
- [ ] `bun run ci` green.

**Files likely touched:** 1 source + 1 test + e2e in `apps/api`.

**Scope:** Medium.

### Checkpoint: Phase 4
- [ ] Both capabilities work end-to-end on new stack.
- [ ] HITL suspend/resume across SSE reconnect works (client can disconnect during approval wait and reconnect).
- [ ] Human review.

---

### Phase 5 — Settings, conversations, models

#### Task 5.1: Settings + conversations + models routes

**Description:** Fill out the remaining endpoints so the new API has parity with the old one. Settings implements the layered resolver cleanly (defaults → scoped store → request overrides).

**Acceptance criteria:**
- [ ] `GET /settings` — returns global + per-capability settings.
- [ ] `PUT /settings` — scoped update (`global` or `<capabilityId>`), validates via capability's `settingsSchema`.
- [ ] `GET /conversations?capabilityId=...` — list conversation summaries.
- [ ] `GET /conversations/:id/messages` — messages rebuilt from events (user input + assistant text-delta aggregation).
- [ ] `DELETE /conversations/:id` — cascade delete runs + events.
- [ ] `GET /models` — from `ProviderResolver.list(keys)`.
- [ ] Settings resolver unit tests for precedence order.
- [ ] Conversation messages test: events from multiple runs in the same conversation produce correctly ordered `[{role:'user'},{role:'assistant'}, ...]`.

**Verification:**
- [ ] `bun test packages/http/src/routes packages/core/src/app` green.
- [ ] `bun run ci` green.

**Files likely touched:** 3 route sources + 3 use case sources + 6 tests.

**Scope:** Large.

### Checkpoint: Phase 5
- [ ] Full API surface exposed at root paths.
- [ ] `apps/api` is feature-complete relative to the old `apps/web-studio/src/server`.
- [ ] Human review.

---

### Phase 6 — Production readiness polish

#### Task 6.1: OpenAPI spec

**Description:** Generate OpenAPI 3.1 spec from route Zod schemas; serve at `GET /openapi.json`. Add `GET /docs` with Scalar or similar renderer (behind dev-only flag if preferred).

**Acceptance criteria:**
- [ ] All routes annotated with request + response schemas.
- [ ] `packages/http/src/openapi.ts` produces valid OpenAPI 3.1.
- [ ] Spec validates via `bunx @redocly/cli lint` or equivalent (added as dev dep).
- [ ] Test: every declared route exists in the spec; every spec path has a handler.

**Verification:**
- [ ] `bun run api`; `curl http://127.0.0.1:3000/openapi.json | redocly lint --stdin` passes.
- [ ] `bun run ci` green.

**Files likely touched:** `openapi.ts`, route files (schema annotations), 1 test.

**Scope:** Medium.

---

#### Task 6.2: Observability — pino + tracer wiring

**Description:** Wire `PinoLogger` end-to-end: request logger middleware adds `{requestId, path, method}` context; all use cases use a scoped logger. Add OpenTelemetry `Tracer` scaffold (NoOp by default) so future Langfuse/OTLP is one adapter swap.

**Acceptance criteria:**
- [ ] Access log line on every request.
- [ ] Error log line on every 5xx (with stack, excluding sensitive input).
- [ ] `RunExecutor` logs run start/complete/fail with runId + capabilityId + durationMs.
- [ ] Tracer spans (NoOp) around: HTTP request, use case invocation, capability execution, event log append.
- [ ] No `console.log` anywhere in `packages/*`.
- [ ] Biome rule `noConsole: error` extends to new packages (inherited).

**Verification:**
- [ ] `bun test` green; log output visible in test runs (pino dev transport).
- [ ] `bun run ci` green.

**Files likely touched:** ~8 files (middleware, use cases, app factory).

**Scope:** Medium.

### Checkpoint: Phase 6
- [ ] API is documented + logged + traced (stubs where real infra absent).
- [ ] Human review before UI cutover.

---

### Phase 7 — Console UI + cutover

#### Task 7.1: `apps/console` — React SPA on new API

**Description:** Move the React SPA from `apps/web-studio/src/ui` into `apps/console`. Update the API client to call the new unversioned endpoints. Use the `SessionEvent` discriminated union from `@harness/http/types` for type-safe event handling in `useEventStream`. Settings panel + HITL modal + stream view work end-to-end against new API.

**Acceptance criteria:**
- [ ] `apps/console` is a standalone Vite + React SPA; imports only `@harness/http/types` from `@harness/*`.
- [ ] `apps/console/src/api/` — typed client for every endpoint.
- [ ] `useEventStream.ts` uses the `SessionEvent` union with exhaustive switch; all current event consumers migrated off string-typed keys.
- [ ] `POST /runs` body uses `{capabilityId, input: {message}, settings, conversationId?}` (new contract; no more `{toolId, question}`).
- [ ] HITL modal posts to `/runs/:id/approve` / `/reject` with `{approvalId, editedPlan?}`.
- [ ] Vite dev proxy targets `http://127.0.0.1:3000`.
- [ ] `VITE_API_BASE_URL` env var supported for prod builds.
- [ ] Root `package.json`: `web` script runs `apps/api` + `apps/console` in parallel.

**Verification:**
- [ ] `bun run web` (starts api + console in parallel).
- [ ] Manual UI test: simple-chat multi-turn with memory; deep-research with plan approve + plan reject paths; settings persistence; conversations list.
- [ ] `bun run ci` green.

**Files likely touched:** full `apps/console/` tree (~30 files, mostly moves with minor edits).

**Scope:** Large.

---

#### Task 7.2: Delete `apps/web-studio`

**Description:** Now that `apps/console` + `apps/api` have parity, remove the legacy app.

**Acceptance criteria:**
- [ ] `apps/web-studio/` deleted.
- [ ] `bun.lock` regenerated.
- [ ] Root `package.json` scripts: `web:server` → `api`; old `web*` scripts removed or redirected.
- [ ] No imports of `@harness/example-web-studio` anywhere.

**Verification:**
- [ ] `bun install && bun run ci` green on a clean clone.
- [ ] Full manual UI smoke test still passes.

**Files likely touched:** deletion of `apps/web-studio/`, `package.json`.

**Scope:** Small (mechanical).

### Checkpoint: Phase 7
- [ ] New stack is THE stack. No legacy code.
- [ ] Clone-and-own verified: delete a capability, rest builds; delete console, api still works.
- [ ] Human review.

---

### Phase 8 — Mastra Studio + documentation

#### Task 8.1: `mastra.config.ts` via capability registry

**Description:** Replace the duplicate wiring in `mastra.config.ts` with a helper from `@harness/capabilities` that derives Mastra agents + workflows from the capability registry.

**Acceptance criteria:**
- [ ] `@harness/capabilities` exports `buildMastraConfig()` returning `{ agents, workflows }` shaped for Mastra.
- [ ] `mastra.config.ts` imports it; adding a capability appears in Studio automatically.
- [ ] Storage config stays in `mastra.config.ts` (env-driven).
- [ ] Test that iterates `capabilityRegistry.list()` and confirms each has a corresponding entry in `buildMastraConfig().agents` OR `.workflows`.

**Verification:**
- [ ] `bun run mastra:dev` — Studio shows simple-chat + deep-research.
- [ ] `bun run mastra:build` succeeds.
- [ ] `bun run ci` green.

**Files likely touched:** `mastra.config.ts`, `packages/capabilities/src/mastra-config.ts` (new), 1 test.

**Scope:** Small.

---

#### Task 8.2: Tighten Biome DAG + update docs

**Description:** Final cleanup.

**Acceptance criteria:**
- [ ] Biome `noRestrictedImports` rules are fully strict (no "legacy" exception for `apps/web-studio` since it's deleted).
- [ ] `CLAUDE.md` rewritten section-by-section to reflect new architecture:
  - New structure diagram.
  - Commands: `api`, `web`.
  - Architecture paragraph describing hexagonal + event-sourced + pluggable capabilities.
  - Non-goals remains.
- [ ] `README.md` updated: local-setup steps, new endpoints.
- [ ] `docs/specs/mastra-migration.md` marked COMPLETED with a pointer to the new architecture.
- [ ] Historical plan artifacts preserved (this file becomes historical after merge — suggest follow-up PR renames to `docs/plans/platform-redesign.md` and moves to archive).

**Verification:**
- [ ] `bun run ci` green.
- [ ] CLAUDE.md `bun run ci` claim is accurate.

**Files likely touched:** `biome.json`, `CLAUDE.md`, `README.md`, `docs/specs/mastra-migration.md`.

**Scope:** Medium.

### Checkpoint: Phase 8 — COMPLETE
- [ ] All acceptance criteria from Phases 0–8 met.
- [ ] `bun run ci` green from a fresh clone.
- [ ] Full manual smoke test: simple-chat, deep-research with approve + reject, settings, conversations.
- [ ] Clone-and-own verified via deletion tests.
- [ ] OpenAPI spec lints clean.
- [ ] Ready for merge.

---

## Deferred: PostgreSQL + Drizzle

> These tasks were scoped out of the initial build to reduce setup friction. The port/adapter architecture means adding Postgres is mechanical — implement the port interfaces against Drizzle, swap adapters in `compose.ts`. No domain or use-case changes required.

### Task D1: Postgres 18 tooling (no Docker)

**Description:** Configure Drizzle against a locally-installed Postgres 18, add `DATABASE_URL` to env, write an idempotent bootstrap script that creates the role + DB + runs migrations so `bun run db:setup` is a one-command local setup.

**Acceptance criteria:**
- [ ] `drizzle.config.ts` at repo root: `schema: './packages/adapters/src/postgres/schema.ts'`, `out: './packages/adapters/src/postgres/migrations'`, dialect `postgresql`.
- [ ] `.env.example` includes `DATABASE_URL=postgres://harness:harness@localhost:5432/harness_dev` and a note: "requires Postgres 18 (brew install postgresql@18 or pgdg apt)".
- [ ] `scripts/db-setup.ts` — idempotent bootstrap: connects as the current OS user to the default `postgres` database; creates `harness` role if missing (with `LOGIN PASSWORD 'harness'`); creates `harness_dev` DB if missing; runs `drizzle-kit migrate` against `DATABASE_URL`. Safe to re-run.
- [ ] Root `package.json` new scripts:
  - `db:setup` → `bun run scripts/db-setup.ts` (creates role+db+migrate).
  - `db:generate` → `drizzle-kit generate` (schema → SQL migration).
  - `db:migrate` → `drizzle-kit migrate` (apply migrations).
  - `db:reset` → drops `harness_dev`, recreates, migrates. For tests/dev only. Guarded against running when `NODE_ENV=production`.
- [ ] Root devDependencies: `drizzle-kit`. Dependencies: `drizzle-orm`, `postgres`, `uuidv7`.
- [ ] `README.md` "Local setup" section:
  - macOS: `brew install postgresql@18 && brew services start postgresql@18`.
  - Linux: link to pgdg apt instructions.
  - Then: `bun install && bun run db:setup`.
- [ ] Preflight check in `db-setup.ts` that asserts `SHOW server_version` reports ≥18; exits with a clear message otherwise (this is load-bearing — we rely on built-in `uuidv7()`).

**Verification:**
- [ ] Fresh machine with PG18 installed: `bun run db:setup` succeeds from zero state; rerunning produces no changes.
- [ ] `psql $DATABASE_URL -c 'SELECT uuidv7()'` returns a UUID (confirms PG 18 built-in).
- [ ] `bun run db:generate` runs cleanly with empty schema.
- [ ] `bun run ci` green.

---

### Task D2: Postgres schema + migrations

**Description:** Drizzle schema + initial migration for `runs`, `events`, `conversations`, `settings`, `approvals`. Every PK of type `uuid` uses `DEFAULT uuidv7()` (Postgres 18 built-in). `created_at` defaults to `now()`; `uuidv7()` is time-ordered, so we also get a naturally sortable primary key.

**Acceptance criteria:**
- [ ] `packages/adapters/src/postgres/schema.ts` defines all tables with Drizzle. Every uuid primary key uses `.default(sql\`uuidv7()\`)`.
  - `runs(id uuid pk default uuidv7(), capability_id, input jsonb, status, conversation_id uuid, created_at timestamptz default now(), finished_at)`.
  - `events(run_id uuid, seq bigint, ts timestamptz, type text, data jsonb, PRIMARY KEY (run_id, seq))`.
  - `conversations(id uuid pk default uuidv7(), capability_id, created_at default now(), last_activity_at)`.
  - `settings(scope text, key text, value jsonb, updated_at, PRIMARY KEY (scope, key))`.
  - `approvals(id uuid pk default uuidv7(), run_id uuid, payload jsonb, status, created_at default now(), resolved_at, decision jsonb)`.
- [ ] Indexes: `(created_at desc)` on `runs`, `conversations`; `(conversation_id)` on `runs`; `(run_id, seq)` is already the `events` PK; `(run_id, status)` on `approvals`.
- [ ] `bun run db:generate` produces migration SQL. Inspect and commit.
- [ ] `bun run db:migrate` applies cleanly to a fresh DB.

**Verification:**
- [ ] `bun run db:reset && bun run db:migrate` succeeds on empty DB.
- [ ] `psql $DATABASE_URL -c '\d runs'` shows expected columns and `uuidv7()` default.
- [ ] `bun run ci` green.

---

### Task D3: Postgres adapters (stores)

**Description:** Implement `PostgresRunStore`, `PostgresEventLog`, `PostgresSettingsStore`, `PostgresApprovalStore`, `PostgresConversationStore`. Each implements the corresponding port from `@harness/core/ports`.

EventLog seq strategy: `INSERT ... SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE run_id = $1` in a single statement; combined with the `(run_id, seq)` PK, concurrent appends either succeed in order or get a unique-violation we retry.

**Acceptance criteria:**
- [ ] Each store is a function `(db: PgClient) => <Port>Implementation` returning an object satisfying the port.
- [ ] `PostgresEventLog.append` produces gap-free, monotonic `seq` per run under concurrent writers (verified by test).
- [ ] Integration tests hit a real Postgres on a **schema-per-test** basis (`CREATE SCHEMA test_<uuid>; SET search_path = ...`).
- [ ] Test helper `packages/adapters/src/postgres/testing.ts` exports `withTestSchema(async (db) => ...)`.

**Verification:**
- [ ] `bun test packages/adapters/src/postgres` green against live Postgres.
- [ ] Concurrency test: 100 parallel `EventLog.append` calls for the same runId produce seq 1..100 in order, no gaps, no duplicates.
- [ ] `bun run ci` green.

---

### Task D4: Swap in-memory → Postgres in compose

**Description:** Update `apps/api/src/compose.ts` to use Postgres adapters when `DATABASE_URL` is set, falling back to in-memory when unset. Add `migrate.ts` for auto-migration on boot (dev only).

**Acceptance criteria:**
- [ ] Config detects `DATABASE_URL`; compose wires Postgres stores or in-memory stores accordingly.
- [ ] `apps/api/src/migrate.ts` — runs drizzle migrations on boot in dev.
- [ ] End-to-end test against real Postgres.
- [ ] Health endpoint reports `{ status: 'ok', store: 'postgres' | 'memory' }`.

---

## Deferred: Multi-tenancy

> The port interfaces are narrow enough that adding tenancy is additive: add a `tenantId` param to store methods, add a `tenant_id` column to Postgres tables, add `AuthPort` + auth middleware. No domain model changes needed.

### Task T1: Auth model + AuthPort

**Description:** Define `AuthPort` and auth middleware for Hono.

**Acceptance criteria:**
- [ ] `packages/core/src/ports/auth-port.ts`:
  ```ts
  interface AuthPort {
    verify(req: { headers: Headers }): Promise<AuthContext>;
  }
  interface AuthContext {
    tenantId: string;
    principalId: string | null;
    scopes: Set<string>;
  }
  ```
- [ ] `packages/adapters/src/identity/no-auth.ts` — returns `{ tenantId: 'default', principalId: null, scopes: new Set(['*']) }`.
- [ ] `packages/http/src/middleware/auth.ts` — calls `deps.auth.verify(c.req.raw.headers)`, sets `c.set('auth', ctx)`.
- [ ] All port methods gain a `tenantId` parameter; all stores filter by it.
- [ ] `ExecutionContext` gains `tenantId: string`.
- [ ] `SessionEvent` `BaseEvent` gains `tenantId: z.string()`.

### Task T2: Tenant-scoped Postgres schema

**Description:** Add `tenant_id text not null default 'default'` to all data tables. Add composite indexes on `(tenant_id, ...)`.

**Acceptance criteria:**
- [ ] Migration adds `tenant_id` column to `runs`, `events`, `conversations`, `settings`, `approvals`.
- [ ] Postgres store implementations add `WHERE tenant_id = ?` to every query.
- [ ] Tenant isolation test: store under `tenant=A` cannot be read under `tenant=B`.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `RunExecutor` is the most complex piece — bugs here break everything | High | Extensive unit tests with fakes in Phase 1; integration tests in Phase 3; property-based test on event seq monotonicity. |
| Capability interface is wrong — forced reshape in Phase 4 when HITL needs it | High | Design `Capability<I, O>` and `ExecutionContext` WITH the HITL case in mind in Phase 1; `approvals: ApprovalRequester` is in `ExecutionContext` from the start. Prototype deep-research at Phase 1 on paper. |
| Mastra workflow suspend semantics differ from what the capability adapter assumes | Medium | Phase 2.3 includes a paper-prototype test with `mockModel`; fail early on mismatch before building HITL routes. |
| In-memory stores lose data on restart | Medium | Acceptable for dev. Postgres follow-up (Deferred D1–D4) adds durability. Document clearly that data is ephemeral. |
| `apps/web-studio` drift during parallel build (fixes landing that aren't mirrored in new stack) | Medium | Freeze `apps/web-studio` non-critical work once Phase 3 starts; only security/bug fixes. |
| Big PRs are hard to review | Medium | Each task = one PR. Average 5–10 files. Task 3.4 (routes) and 7.1 (console) are intentionally large — split further if reviewer requests. |
| Mastra memory in LibSQL + run state in memory means two stores | Low | Acceptable: Mastra memory is an internal detail of the memory-provider adapter; platform state is in-memory (later Postgres). |
| API versioning: need to add `/v1` later without breaking clients | Low | `createHttpApp` accepts a `basePath` option from day one; adding `/v1` is a one-line flip when the first breaking change lands. OpenAPI spec + typed DTOs already in place. |

---

## Out of Scope (follow-ups after this plan)

- **Postgres + Drizzle durable storage** (see Deferred D1–D4 above).
- **Auth/tenancy** (see Deferred T1–T2 above).
- Rate limiting (stub middleware exists; no storage adapter yet).
- MCP server transport (`packages/mcp/`).
- Redis / Postgres-NOTIFY EventBus adapters (in-memory is fine for single-instance).
- Langfuse / OTLP tracer exporter.
- Cost ledger as first-class domain concept (currently aggregated from `usage` events in queries).
- Vector / RAG primitives (explicitly a non-goal per CLAUDE.md).
- `apps/api` Dockerfile + production deployment config.
- SDK package `@harness/client` (TS SDK generated from OpenAPI; clone-and-own friendly).

---

## Open Questions

1. **Do we keep `@harness/agents`, `@harness/workflows`, `@harness/tools` as separate packages or merge into `@harness/capabilities/mastra-primitives`?** Current recommendation: keep separate — they're useful as Mastra building blocks for someone writing a new capability even outside this project.
2. **Package naming — `@harness/core`, `@harness/adapters`, `@harness/capabilities`, `@harness/http`** — or more-specific names like `@harness/platform-core`, `@harness/infra`, etc.? My preference: the short names above; the `@harness/` scope already gives context. Confirm.
3. **Should `apps/console` be renamed further** (e.g., `apps/studio-ui` → `apps/console` per this plan vs. something else)? Keeping `apps/console`.
4. **OpenAPI renderer**: Scalar, Swagger UI, Redoc, or just serve the JSON? Scalar is the modern pick. Confirm.

---

## Verification Summary

| Command | Scope | Run after |
|---|---|---|
| `bun run lint` | Biome | every task |
| `bun run typecheck` | workspaces | every task |
| `bun run build` | workspaces | every task |
| `bun test` | all | every task |
| `bun run api` + curl | live API | Phase 3.5 onward |
| `bun run web` (api + console) | full stack | Phases 7, 8 |
| `bun run mastra:dev` | Studio | Phase 8 |
| Clone-and-own deletion tests | invariant | Phase 7, 8 |
| OpenAPI lint | spec | Phase 6 onward |
