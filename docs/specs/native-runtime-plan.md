## Native Runtime Plan — Drop the `Capability<I, O>` abstraction

**Status:** Draft · **Owner:** @tien · **Date:** 2026-04-24
**Relationship to other plans:**
- Supersedes the "Path B — keep hexagonal port" recommendation in `architecture-review-2026-04.md`.
- Does **not** replace `docs/plan.md`'s hexagonal foundation for stores, event sourcing, HTTP, and observability — those boundaries stay.
- Narrow in scope: this plan only covers collapsing the capability/runtime indirection.

**Naming rule for this plan:**
> No new folder or file may contain the word "mastra". The underlying agent/workflow runtime is the default and is referenced by role ("runtime", "agent", "workflow"), not by product name. Pre-existing external contracts we cannot rename are listed in the *Unavoidable references* section.

---

## Why Path A now

The review confirmed three facts:

1. The runtime will not be swapped. Keeping a swappable port is paying insurance against a risk we've chosen not to carry.
2. The indirection is non-trivial: `fromMastraAgent` / `fromMastraWorkflow` re-implement the shape of what the underlying runtime already exposes, and every capability has to go through a double-hop (`Capability.execute → runtime call → event mapper → `CapabilityEvent` → `SessionEvent`).
3. For a **clone-and-own template** (the confirmed primary use case), an abstraction nobody is going to swap out costs more than it teaches. Forkers read the port, search for the second adapter, find none, and lose trust.

Collapsing the layer removes ~500 lines, one coordinate system (`CapabilityEvent`), and one class of bug (mapper drift). Tests that needed a fake `Capability` now use the runtime's test helpers directly (`mockModel()` already exists).

---

## What changes conceptually

| Before | After |
|---|---|
| `Capability<I, O>` port in `packages/core/src/domain/capability.ts` with `execute(input, ctx): AsyncIterable<CapabilityEvent>` | `CapabilityDefinition<I, O, S>` metadata record (id, title, description, schemas, runner) — no `execute` method |
| `fromMastraAgent` / `fromMastraWorkflow` adapters wrap a runtime agent/workflow in `Capability` | Capabilities **are** a runner + metadata. No wrapping. |
| Two event coordinate systems: `CapabilityEvent` (internal) and `SessionEvent` (wire) | One. `RunExecutor` maps runtime stream chunks straight to `SessionEvent`s. |
| Capability tests fake the port | Capability tests use `mockModel()` from the agents package; `RunExecutor` tests fake the runner |
| `packages/adapters/src/mastra/*` | Dissolved. Contents redistributed by role (see structure below). |

---

## Target structure (no "mastra" in names)

```
packages/
  core/
    src/
      domain/
        run.ts
        session-event.ts
        capability.ts           # now pure metadata types (CapabilityDefinition)
        approval.ts
        conversation.ts
      app/
        run-executor.ts         # knows how to run an agent or workflow directly
        event-mapper.ts         # runtime stream chunk → SessionEvent (moved from adapters)
        start-run.ts
        stream-run-events.ts
        approve-run.ts
        cancel-run.ts
        ...use cases
      ports/                    # stores, bus, providers, clock — unchanged
  adapters/                     # only the non-runtime adapters remain here
    src/
      inmem/
      identity/
      observability/
      providers/
      conversation-memory.ts    # was adapters/mastra/memory-provider.ts
      runtime-singleton.ts      # was adapters/mastra/singleton.ts
  capabilities/
    src/
      registry.ts
      simple-chat/
        capability.ts           # exports a CapabilityDefinition directly
        input.ts
        settings.ts
      deep-research/
        capability.ts
        input.ts
        settings.ts
      studio-config.ts          # was mastra-config.ts — builds the config for the studio CLI
      with-model-override.ts
  tools/                        # unchanged (generic name)
  agents/                       # unchanged (generic name)
  workflows/                    # unchanged (generic name)
  http/                         # unchanged
apps/
  api/
  console/
```

### `packages/core/src/domain/capability.ts` (after)

```ts
import type { Agent } from '@mastra/core/agent';
import type { Workflow } from '@mastra/core/workflows';
import type { z } from 'zod';

export type CapabilityRunner =
  | { readonly kind: 'agent'; readonly build: (settings: unknown) => Agent; readonly extractPrompt: (input: unknown) => string; readonly maxSteps?: number }
  | {
      readonly kind: 'workflow';
      readonly build: (settings: unknown) => Workflow;
      readonly extractInput: (input: unknown) => Record<string, unknown>;
      readonly approveStepId?: string;
      readonly extractPlan?: (steps: Record<string, unknown>) => unknown;
    };

export interface CapabilityDefinition<I = unknown, O = unknown, S = unknown> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly settingsSchema: z.ZodType<S>;
  readonly supportsApproval?: boolean;
  readonly runner: CapabilityRunner;
}
```

Note: this is the one spot where `@harness/core` gains a runtime import. That's intentional — it's the commitment we're making.

---

## Tasks

Each task lands as its own commit. `bun run ci` must pass after every task.

### T1 · Move `event-mapper` into core and kill `CapabilityEvent`
**Files:** move `packages/adapters/src/mastra/event-mapper.ts` → `packages/core/src/app/event-mapper.ts`. Delete `CapabilityEvent` type from `packages/core/src/domain/capability.ts`. Change the mapper to return `SessionEvent` payloads (sans runId/seq/ts) directly. Update `Run.append` to accept the mapper's output type instead of `CapabilityEvent`.

**Acceptance:** one event coordinate system remains; `CapabilityEvent` symbol is gone from the codebase.

### T2 · Replace the `Capability` port with `CapabilityDefinition`
**Files:** `packages/core/src/domain/capability.ts` (replace), every call site that types against `Capability`.

`CapabilityDefinition` is a plain data record with a `runner` discriminator. No `execute` method.

**Acceptance:** `Capability<I, O>` type is deleted; no code imports it.

### T3 · Teach `RunExecutor` to run agents and workflows directly
**Files:** `packages/core/src/app/run-executor.ts`.

Branch on `runner.kind`. For `agent`, `await agent.stream(prompt, { abortSignal, maxSteps, memory })` and pipe chunks through `event-mapper`. For `workflow`, `createRun().start(...)` and handle the `suspended` → approval → `resume(...)` loop inline. The approval suspend/resume events are still emitted by the `Run` aggregate, unchanged.

**Acceptance:** both `simple-chat` and `deep-research` capabilities run against the executor without any `fromX` wrapper; the deep-research HITL flow still works end-to-end.

### T4 · Rewrite `simple-chat` and `deep-research` as `CapabilityDefinition` exports
**Files:** `packages/capabilities/src/simple-chat/capability.ts`, `packages/capabilities/src/deep-research/capability.ts`.

Each file exports a `CapabilityDefinition` object — schemas + a `runner` block. The `createAgent` / `createWorkflow` logic moves inline (or into local builders in the same folder).

**Acceptance:** neither file imports from `packages/adapters/src/mastra/*`. Both capability-level tests use `mockModel()` directly.

### T5 · Delete the adapter bridge
**Files:** delete `packages/adapters/src/mastra/from-agent.ts`, `from-workflow.ts`, `index.ts` (relevant exports). Move `memory-provider.ts` → `packages/adapters/src/conversation-memory.ts`. Move `singleton.ts` → `packages/adapters/src/runtime-singleton.ts`. Delete the now-empty `packages/adapters/src/mastra/` directory.

**Acceptance:** `rg -l mastra packages/adapters/src` returns only files that import the runtime SDK, never a path containing `mastra/`.

### T6 · Rename `mastra-config.ts` → `studio-config.ts`
**Files:** `packages/capabilities/src/mastra-config.ts` → `packages/capabilities/src/studio-config.ts`; update export name from `buildMastraConfig` → `buildStudioConfig`; update `mastra.config.ts` at repo root to import the new name.

**Acceptance:** no file under `packages/` has "mastra" in its name.

### T7 · Update Biome `noRestrictedImports`
**Files:** `biome.json`.

Remove the rules that forbid runtime imports from core — `packages/core` is now allowed to import `@mastra/core`. Add new rules: HTTP and app layers still must not import runtime SDKs directly (they go through capabilities).

**Acceptance:** layering rules reflect the new architecture; `bun run lint` passes.

### T8 · Update `CLAUDE.md` and `docs/plan.md`
**Files:** `CLAUDE.md`, `docs/plan.md`.

- Invariant #2 becomes: *"Capabilities are `CapabilityDefinition`s composed of a runner (agent or workflow) plus metadata. There is no runtime-swap abstraction."*
- Remove references to `fromMastraAgent` / `fromMastraWorkflow`.
- Note the single remaining cross-cutting import into core (the runtime SDK) and the rationale.

**Acceptance:** docs match code; no stale "Mastra is one adapter" phrasing anywhere.

### T9 · Rename package scripts
**Files:** `package.json`.

`mastra:dev` → `studio:dev`, `mastra:build` → `studio:build`. The underlying command still invokes the `mastra` CLI binary — that's an external tool name, not ours.

**Acceptance:** `bun run studio:dev` works; no `mastra:*` script remains.

---

## Unavoidable references

Kept as-is; documented so reviewers don't try to rename them:

- **`mastra.config.ts`** at the repo root. The `mastra` CLI discovers this file by hard-coded name; renaming breaks `mastra dev` / `mastra build`.
- **`bunx mastra dev` / `bunx mastra build`** inside `package.json` scripts. The binary name is `mastra`; the script name wrapping it is not.
- **`@mastra/core`, `@mastra/memory`, `@mastra/libsql` imports.** Package names come from the vendor.

These are the only three places "mastra" appears after this plan lands.

---

## What we're accepting

- **`packages/core` imports `@mastra/core` types.** The port-vs-adapter purity is gone at the capability seam. Acceptable because we've committed to the runtime.
- **Capability tests look different.** No fake `Capability`; use `mockModel()` and run the executor end-to-end. This is arguably closer to integration testing — the review recommendation is to lean into it, since fakes of the old port were thin.
- **Retrofitting a second runtime later is not free.** If that ever becomes a goal, restoring a port on top of `CapabilityDefinition` is ~1 day's work — but don't plan around that option.

---

## Interaction with `architecture-review-2026-04.md`

| Item in the earlier review | After this plan |
|---|---|
| P0-1 (reframe Mastra-optional invariant) | Absorbed into T8. |
| P0-2 (type `ExecutionContext.settings`) | Still applies — do it as part of T3 (the new executor typing). |
| P0-3 (`v` on `SessionEvent`) | Unchanged; do after T1. |
| P0-4 (`apps/cli`) | Unchanged; do after T3 so CLI uses the new executor path. |
| P0-5 (RAG non-goal) | Unchanged; text-only edit. |
| P1-1 (consolidate Mastra packages) | **Dropped.** The adapter subtree no longer exists; `packages/tools|agents|workflows` keep their generic names and stay where they are. |
| P1-2 (`composeHarness`) | Unchanged; do after T5. |
| P1-3, P1-4, P1-5 | Unchanged. |

---

## Ordering

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9. Do not merge out of order — T3 needs T2's type change, T4 needs T3's executor, T5 needs T4's call-site removal, and T7/T8/T9 are cleanup that presupposes the moves are done.
