# Plan v2 — shared Mastra storage, observability, evals, selective registration

Status: proposed, awaiting human review. Supersedes the v1 `apps/studio` plan (now done; see git history at `86ddeda`).

## Goals

1. **Single Mastra storage** shared by `apps/studio` and `apps/api` (and `apps/cli`) so API/CLI runs surface in Studio (traces, agent memory, workflow snapshots, eval results).
2. **Mastra telemetry on all apps** so traces flow into the shared store and render in Studio's Traces tab. No external collector.
3. **Inject `Mastra` into capability adapters** — eliminate the per-invocation `new Mastra({...})` anti-pattern in `packages/mastra/src/capabilities/*/capability.ts`.
4. **Selective registration in `apps/api` / `apps/cli`** — each app explicitly lists the agents/workflows it actually uses. **`apps/studio` auto-registers everything** via barrel exports from `@harness/mastra`, so new agents/workflows/tools appear in Studio with no Studio edit.
5. **Evals via `@mastra/evals`** — starter metrics on existing agents/workflows + a pattern that auto-extends to future ones. Run as a separate test suite (`bun test:evals`, gated by `HARNESS_EVAL=1`) and on-demand in Studio.

## Locked decisions

| ID | Decision |
|----|----------|
| A  | Shared storage = Mastra storage **only**. Harness's `RunStore`/`EventLog`/`ConversationStore` stay in-memory (out of scope). |
| B  | Storage path: `<repo-root>/.mastra/mastra.db`, env-overridable via `MASTRA_DB_URL`. Single helper `createMastraStorage()` in `@harness/mastra/runtime` resolves the absolute path from the package's `import.meta.url`. |
| C  | Capabilities accept a `Mastra` instance via DI; runners look up agents/workflows by name with `mastra.getAgent(...)` / `mastra.getWorkflow(...)`. (Mastra-native pattern, traces propagate.) |
| D  | `createCapabilityRegistry(capabilities: CapabilityDefinition[])` — accepts a list, no longer constructs capabilities itself. |
| E  | `apps/api` and `apps/cli` each construct their own `new Mastra({...})` with explicit agent/workflow maps. `apps/studio` uses `allAgents/allWorkflows/allTools` barrels. |
| F  | Telemetry: `telemetry: { enabled: true, serviceName }` on each Mastra instance. No OTLP exporter. |
| G  | Evals: starter set = `AnswerRelevancyMetric` + `ContentSimilarityMetric` for chat agents, `FaithfulnessMetric` + `HallucinationMetric` for research-style workflows. Defaults applied automatically by the agent/workflow factories so future ones inherit. Judge model = same `model` as the agent (ollama-friendly). |
| H  | No restructure of `packages/mastra` layout. |

## Constraints

- Preserve **invariant #2** (capabilities are data) and **#9** (clone-and-own — deleting `packages/mastra/` and `apps/studio/` must still leave `core + http + bootstrap + apps/api + apps/cli + apps/console` green). Phase 4 means `apps/api` / `apps/cli` will start importing `@mastra/core` directly to construct `Mastra` — that's a deliberate widening; the boundary lint rule must be updated to allow it.
- Preserve all v1 boundary rules (`@harness/http`, `@harness/bootstrap`, `@harness/core` still forbidden in `apps/studio`; `@mastra/editor` + `mastra` CLI still forbidden in `apps/api` / `apps/cli`).
- TDD applies inside `packages/mastra` (capability refactor + evals).

## Dependency graph after the change

```
@harness/core ─→ @harness/http
       ↑
@harness/mastra ─→ @harness/mastra/runtime (storage, logger, telemetry helpers)
       ↑                  │
@harness/bootstrap        │
       ↑                  │
       │                  │
apps/api  ─→ @harness/http, @mastra/core (constructs own Mastra)
apps/cli  ─────────────────→ @mastra/core (constructs own Mastra)
apps/console (http types only)
apps/studio ──────────────┘   (still no http/bootstrap/core)
```

All Mastra instances point at the **same LibSQL file** (`<repo>/.mastra/mastra.db`).

---

## Phasing & checkpoints

Seven phases, sequential. Each phase ends in a `bun run ci` checkpoint plus the named verification.

---

### Phase 0 — Cleanup stale files

**Task 0.1 — Delete stale `/src/mastra/` at repo root**
- Left over from the v1 migration (Phase 2.2 missed it). Studio now owns Mastra composition.
- **Acceptance:** `ls /src 2>/dev/null` empty (or absent); `bun run ci` green.

**Task 0.2 — Confirm only `apps/studio/src/mastra/index.ts` defines a `Mastra` instance**
- `grep -rn "new Mastra(" --include="*.ts" .` should show only `apps/studio/src/mastra/index.ts`, the per-capability files (to be refactored in Phase 3), and test files.
- **Acceptance:** grep audit recorded.

**Checkpoint 0:** `bun run ci` green.

---

### Phase 1 — `@harness/mastra/runtime` helpers (storage, logger, telemetry)

Goal: one place that knows how to wire Mastra to the shared LibSQL file, the standard PinoLogger, and the telemetry config. Apps consume helpers; no app re-implements path-resolution.

**Task 1.1 — Add `packages/mastra/src/runtime/storage.ts`**
- `createMastraStorage({ url? })` returns a `LibSQLStore`. URL precedence: arg → `process.env.MASTRA_DB_URL` → `defaultRepoDbUrl()`.
- `defaultRepoDbUrl()` resolves `<repo-root>/.mastra/mastra.db` by walking up from `import.meta.url` until it finds `bun.lockb` (or `pnpm-workspace.yaml` / `biome.json`); returns `file:` + absolute path. Caches the resolved path.
- **TDD:** unit test with a fake fs walker; verify env override and arg override.
- **Acceptance:** test passes; `bun run --filter @harness/mastra typecheck` green.

**Task 1.2 — Add `packages/mastra/src/runtime/logger.ts`** *(parallelizable with 1.1)*
- `createMastraLogger({ level?, pretty? })` returns a `PinoLogger` with sensible defaults (`level=info`, `pretty=NODE_ENV !== 'production'`).
- **Acceptance:** typecheck.

**Task 1.3 — Add `packages/mastra/src/runtime/telemetry.ts`** *(parallelizable with 1.1)*
- `defaultTelemetryConfig(serviceName: string)` returns the Mastra telemetry config object: `{ serviceName, enabled: true, sampling: { type: 'always_on' } }` (verify field names against `@mastra/core`'s `TelemetryConfig` type).
- **Acceptance:** typecheck.

**Task 1.4 — Re-export from `@harness/mastra`**
- Add to `packages/mastra/src/index.ts`: `export * from './runtime/index.ts';` and create `runtime/index.ts` barrel.
- Add subpath export: `"./runtime": "./src/runtime/index.ts"` in `packages/mastra/package.json`.
- **Acceptance:** `import { createMastraStorage } from '@harness/mastra/runtime'` resolves.

**Checkpoint 1:** `bun run ci` green. New helpers exist, nothing else changed.

---

### Phase 2 — Studio uses helpers + barrels (auto-registration)

Goal: studio rebuilt around barrel exports so future agents/workflows/tools appear automatically.

**Task 2.1 — Add `allAgents` / `allWorkflows` / `allTools` barrels**
- In `packages/mastra/src/agents/index.ts`:
  ```ts
  export const allAgents = (opts: { model: MastraModelConfig }) => ({
    simpleChatAgent: createSimpleChatAgent(opts),
  });
  ```
- Same shape for `workflows/index.ts` (`allWorkflows`) and `tools/index.ts` (`allTools()` — no model needed).
- Re-export from `packages/mastra/src/index.ts`.
- **Convention:** every new agent/workflow/tool MUST be added to its `all*` map in the same PR. Document in CLAUDE.md (Phase 7).
- **Acceptance:** typecheck; existing imports unaffected.

**Task 2.2 — Refactor `apps/studio/src/mastra/index.ts`**
- Replace ad-hoc `LibSQLStore` / `PinoLogger` construction with `createMastraStorage()` / `createMastraLogger()`.
- Replace explicit `simpleChatAgent` / `deepResearch` registration with spread of `allAgents({ model })` / `allWorkflows({ model })` / `allTools()`.
- Add `telemetry: defaultTelemetryConfig('harness-studio')`.
- **Acceptance:** `bun run studio:dev` boots; Studio shows `simpleChatAgent`, `deepResearch`, **and** the four tools (`calculator`, `fetch`, `fs`, `getTime`) in the tool browser; LibSQL file lands at `<repo>/.mastra/mastra.db` (not `apps/studio/.mastra/mastra.db`).

**Checkpoint 2:** `bun run ci` green; manual Studio smoke pass; DB file at repo root.

---

### Phase 3 — Refactor capabilities to accept `Mastra` (DI)

Goal: kill per-invocation `new Mastra({...})` so traces propagate and capabilities don't re-pay construction cost.

**Task 3.1 — Change capability factory signatures (TDD)**
- `createSimpleChatCapability({ mastra, logger })`
- `createDeepResearchCapability({ mastra, logger })`
- Inside the runner: replace `new Mastra({...})` and direct agent/workflow construction with `mastra.getAgent('simpleChatAgent')` / `mastra.getWorkflow('deepResearch').createRun().start({ inputData })`.
- Update `adapters/agent-adapter.ts` and `adapters/workflow-adapter.ts` to take handles from a passed-in `Mastra` rather than constructing.
- Update tests (`*.capability.test.ts`, `adapters/testing.ts`) to construct a real `Mastra` (with `simpleChatAgent` registered, `mockModel()`, in-memory LibSQL `file::memory:?cache=shared`) and pass it in.
- **Acceptance:** all existing tests green; `grep -rn "new Mastra(" packages/mastra/src/capabilities/` returns nothing (excluding test fixtures).

**Task 3.2 — Update `createCapabilityRegistry` to take a list**
- New signature: `createCapabilityRegistry(capabilities: CapabilityDefinition[]): CapabilityRegistry`.
- Drop the `IMastraLogger` parameter; capability construction (and its logger dep) is now the caller's responsibility.
- Existing callers in `apps/api` and `apps/cli` will be updated in Phase 4.
- **Acceptance:** `packages/mastra` tests green; `bun run --filter @harness/mastra typecheck` green.

**Checkpoint 3:** `bun run --filter @harness/mastra ci` green. `apps/api` / `apps/cli` are temporarily broken — Phase 4 fixes them.

---

### Phase 4 — `apps/api` + `apps/cli` construct own `Mastra`, register selectively, share storage

**Task 4.1 — `apps/api/src/compose.ts`**
- Construct `Mastra` here:
  ```ts
  import { Mastra } from '@mastra/core';
  import {
    createSimpleChatAgent, createDeepResearchWorkflow,
    createMastraStorage, createMastraLogger, defaultTelemetryConfig,
    resolveModel,
  } from '@harness/mastra';
  import {
    createSimpleChatCapability, createDeepResearchCapability, createCapabilityRegistry,
  } from '@harness/mastra/capabilities';

  const model = /* same model resolution as studio */;
  const mastra = new Mastra({
    agents:    { simpleChatAgent: createSimpleChatAgent({ model }) },
    workflows: { deepResearch:    createDeepResearchWorkflow({ model }) },
    storage:   createMastraStorage(),
    logger:    createMastraLogger(),
    telemetry: defaultTelemetryConfig('harness-api'),
  });

  const { deps, shutdown } = composeHarness({
    capabilityRegistry: createCapabilityRegistry([
      createSimpleChatCapability({ mastra, logger: deps.mastraLogger }), // ← wiring detail TBD; see 4.3
      createDeepResearchCapability({ mastra, logger: deps.mastraLogger }),
    ]),
    logLevel: config.logLevel,
  });
  ```
- Add `apps/api/src/model.ts` (small helper) that mirrors studio's model resolution so both apps stay in sync.
- **Acceptance:** `bun run api` boots; `POST /runs` returns 201; `GET /runs/:id/events` streams events; trace shows up in Studio for the same run after refresh.

**Task 4.2 — `apps/cli/src/index.ts`** *(parallelizable with 4.1)*
- Same Mastra construction + registry pattern as 4.1.
- **Acceptance:** `bun run start "hello"` prints JSON-line events; trace appears in Studio.

**Task 4.3 — Resolve `mastraLogger` chicken-and-egg in `composeHarness`**
- `composeHarness` currently builds `mastraLogger` internally and passes it to the capability-registry factory. With the new list signature, capabilities are built *outside* `composeHarness`, so the caller needs the logger first.
- Options:
  - **(a)** Export a standalone `createMastraLogger()` (Phase 1.2 already does); apps build the logger, pass it to both capabilities and `composeHarness`.
  - **(b)** Add a `createCapabilityRegistry: (mastraLogger) => CapabilityRegistry` overload to `composeHarness` for convenience.
- Recommend **(a)** — explicit beats hidden. Update `composeHarness` to accept an optional pre-built `mastraLogger`.
- **Acceptance:** typecheck green; both apps wire the logger explicitly.

**Task 4.4 — Update biome `noRestrictedImports` for `apps/api` and `apps/cli`**
- Forbidden today: `@mastra/editor`, `mastra` (CLI), `@mastra/editor/*`. Keep all of these.
- Now-allowed: `@mastra/core`, `@mastra/libsql`, `@mastra/loggers` (transitively used through `@harness/mastra/runtime`, but apps may also import directly).
- Add `@harness/mastra/runtime` to the explicit allow-list comment for clarity.
- **Acceptance:** `bun run lint` green; manual probe — inserting `import { Mastra } from '@mastra/core'` in `apps/api/src/index.ts` no longer errors; inserting `import {} from '@mastra/editor'` still errors.

**Checkpoint 4:** `bun run ci` green. End-to-end: start `apps/api`, POST a run, open Studio → run's traces visible in the Traces tab. Same for `apps/cli`.

---

### Phase 5 — Telemetry verification

Goal: confirm Mastra's built-in OTel actually writes to LibSQL and renders in Studio.

**Task 5.1 — Verify trace capture**
- POST a run via API; query the LibSQL DB directly: `sqlite3 .mastra/mastra.db 'select count(*) from mastra_traces;'` should be > 0.
- Open Studio → Traces tab → see span tree for the agent call (model invocation, tool calls if any).
- **Acceptance:** screenshot/notes recorded.

**Task 5.2 — Document fallback if traces are empty**
- If traces don't show, the most likely culprit is `telemetry.enabled=false` defaults or sampling config. Doc the diagnostic in CLAUDE.md (Phase 7).

**Checkpoint 5:** trace round-trip works end-to-end.

---

### Phase 6 — Evals

Goal: starter eval coverage on existing agents/workflows + a convention that future ones inherit. Separate test suite (`bun test:evals`), on-demand in Studio.

**Task 6.1 — Install `@mastra/evals`, set up directory layout**
- Add `@mastra/evals` to `packages/mastra/dependencies` (pin to a version compatible with `@mastra/core@1.27.0`).
- Add `packages/mastra/src/evals/`:
  - `defaults.ts` — exports `defaultAgentEvals(model)` returning `{ relevancy: new AnswerRelevancyMetric(model), similarity: new ContentSimilarityMetric() }` (similarity doesn't need a judge model).
  - `defaults.ts` also exports `defaultWorkflowEvalMetrics(model)` returning `{ faithfulness: ..., hallucination: ... }` for use in workflow eval tests.
- **Acceptance:** typecheck; `bun install` resolves.

**Task 6.2 — Wire defaults into agent factories**
- Refactor `createSimpleChatAgent({ model, evals? })` to default `evals` to `defaultAgentEvals(model)` and pass to `new Agent({ ..., evals })`.
- Pattern documented: every new agent factory should accept `evals?` with the same default. Future agents auto-inherit.
- **TDD:** test that `createSimpleChatAgent({ model })` exposes the metric keys on its `Agent` instance.
- **Acceptance:** test green; Studio shows the agent's eval metrics on its detail page.

**Task 6.3 — Eval test files, gated**
- Add `packages/mastra/src/agents/simple-chat.eval.test.ts` — sample inputs (3–5 cases), call `agent.generate(input)`, run each metric, assert thresholds (e.g., `relevancy.score > 0.6`). Use real model (ollama by default) — gated by `HARNESS_EVAL=1` so unit `bun test` skips them.
- Add `packages/mastra/src/workflows/deep-research/deep-research.eval.test.ts` — execute workflow on a fixture input, run faithfulness + hallucination metrics over the final report against the gathered findings.
- **Skip mechanism:** at top of each `*.eval.test.ts`: `if (!process.env.HARNESS_EVAL) { describe.skip(...) }` (or test.skipIf).
- Add root `package.json` script: `"test:evals": "HARNESS_EVAL=1 bun test --test-name-pattern '\\[eval\\]'"` (or filter by file glob — verify `bun test`'s globbing).
- **Acceptance:** `bun test` skips evals; `bun run test:evals` runs them and exits 0.

**Task 6.4 — Confirm Studio's Evals tab shows scores**
- Run `bun run test:evals` once with shared LibSQL pointed at `.mastra/mastra.db` (not `:memory:`). Mastra writes eval results to storage; Studio reads them.
- **Acceptance:** Studio's agent → Evals tab shows the metric runs.

**Checkpoint 6:** `bun run ci` green (evals skipped); `bun run test:evals` green; Studio Evals tab populated.

---

### Phase 7 — Documentation

**Task 7.1 — Update CLAUDE.md**
- Commands table: add `bun run test:evals` row.
- Architecture section: add a paragraph on shared Mastra storage (path, env var, what's persisted, who writes).
- "Adding a new agent/workflow/tool" convention: new entry MUST be added to the corresponding `all*` map in `packages/mastra` so Studio picks it up automatically.
- Telemetry diagnostic note from Task 5.2.
- **Acceptance:** doc reads cleanly; nothing stale.

**Task 7.2 — `.env.example`** *(parallelizable with 7.1)*
- Add `MASTRA_DB_URL` row with the default value documented.
- **Acceptance:** file exists / row present.

**Checkpoint 7 — final acceptance**
- `bun run ci` green.
- `bun run test:evals` green (with `HARNESS_EVAL=1`).
- Round-trip smoke: `bun run api` → POST `/runs` with `simple-chat` → run completes → Studio shows the run in Traces tab → metric scores visible (after a `bun run test:evals` pass that exercises the same agent).
- Invariant probe: `mv packages/mastra /tmp/.bak && mv apps/studio /tmp/.bak2 && bun run --filter @harness/core typecheck && ...` exits 0; restore.

---

## Verification commands (reference)

| When | Command |
|------|---------|
| After every task | `bun run lint` |
| After phase boundary | `bun run ci` |
| Studio smoke | `bun run studio:dev` |
| API smoke | `bun run api` |
| Trace round-trip | `sqlite3 .mastra/mastra.db 'select count(*) from mastra_traces;'` |
| Eval suite | `bun run test:evals` |

## Risks & open questions

1. **Mastra `telemetry` field shape.** Verify the exact shape against `@mastra/core@1.27.0`'s `TelemetryConfig` — the helper in Task 1.3 may need adjusting. If sampling-config keys differ, treat the helper as the single source of truth for the wire format.
2. **Workflow steps and the `mastra` arg.** `deep-research` steps may rely on having a Mastra instance with specific agents/workflows registered. After Phase 3, steps receive the *app's* Mastra (which has `simpleChatAgent` + `deepResearch` registered in api/studio/cli). Verify steps don't reference anything that wasn't on the per-call Mastra.
3. **`bun test` glob/tag filter for evals.** `bun test` doesn't have first-class tags. The simplest reliable approach is filename convention (`*.eval.test.ts`) + a script that runs `bun test packages/mastra/src/**/*.eval.test.ts`. Verify glob support; fall back to env-gating inside each file if globbing is brittle.
4. **Eval cost with cloud providers.** Ollama is free; cloud providers (OpenAI/etc.) pay per LLM-judge call. Evals run on-demand only — document expected token cost in CLAUDE.md once a starter run is profiled.
5. **`MASTRA_DB_URL` for `:memory:` dev mode.** Some devs may prefer ephemeral storage (no persisted DB). `MASTRA_DB_URL=file::memory:?cache=shared` works but only within a single process — Studio + API in separate processes won't share it. Doc this caveat.
6. **`workflows[*].evals`.** Mastra workflows don't have a built-in `evals` field on `createWorkflow`. Workflow metrics are evaluated at the test level by feeding the workflow output into a metric. Phase 6.3 follows this pattern. If Mastra adds workflow-native evals later, migrate.
7. **Concurrent LibSQL writes.** Studio + API + CLI all writing to one SQLite file = potential lock contention under load. Fine for dev; not a production deploy story (and we're not building one yet — out of scope).

## Out of scope (explicitly)

- OTLP exporter / external collector (Jaeger / Tempo / Honeycomb).
- Migrating Harness's `RunStore` / `EventLog` / `ConversationStore` to LibSQL.
- Restructuring `packages/mastra` layout.
- Wiring eval thresholds into CI gates (CI stays unit-only; evals run on-demand).
- Production deploy story for Studio or shared storage.
- Wiring published Editor prompt overrides back into `apps/api`.
