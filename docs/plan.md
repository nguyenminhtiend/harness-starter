# Implementation Plan: Mastra Feature Gallery

## Overview

Build a portfolio of **7 small agents + 3 small workflows** (10 pieces total) that together exercise the full Mastra v1 feature surface. Spec lives at [`docs/mastra-feature-gallery-plan.md`](./mastra-feature-gallery-plan.md). Each piece is intentionally pedagogical (toy domains, ≤150 LOC), independently shippable, and validated end-to-end in Studio before being wrapped as a `CapabilityDefinition` and registered in `apps/api` / `apps/cli`.

The previous `plan.md` (v2 platform-redesign) is fully shipped; this plan supersedes it. Historical content is in git history (last commit on file: `eb1eb0a`, `0ca081f`).

## Architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Build loop | **Studio-first; capability-export later** | Wire each piece into `allAgents`/`allWorkflows` first; verify in Studio (traces, evals, suspend/resume UI); only then wrap as `CapabilityDefinition`. |
| Infra wiring | **Path 1 — fat barrel** | `allAgents` constructs shared `LibSQLVector`, default `Memory`, and default `MCPClient` once and threads them into factories. Apps that need different wiring bypass the barrel. |
| Slicing | **Vertical per piece** | Each task ships one piece end-to-end (factory + unit test + Studio verification + barrel registration). |
| Build order | **Easiest-first** (echo → memory → guardrail → rag → graph-rag → mcp → supervisor → control-flow → hitl → sandbox) | Earliest piece becomes the template every later piece copies; supervisor is built after its 3 subagents exist. |
| Capability export | **Phase 5, after all 10 pieces are Studio-green** | Reduces churn — no piece gets capability-wrapped until its API surface is stable. |
| DAG respect | **Work confined to `packages/mastra/` + thin `apps/studio/` config**; `core`/`http`/`bootstrap` untouched | Per CLAUDE.md "deleting `packages/mastra/` must leave core+http+bootstrap building cleanly". Only Tasks 0.4 + 4.5 add a small block to `apps/studio/src/mastra/index.ts`. `apps/api` + `apps/cli` register capabilities in Phase 5. |
| TDD policy | **Per CLAUDE.md** — TDD enforced for `packages/*`. Eval tests gated by `HARNESS_EVAL=1`. Use `mockModel()` from `@harness/mastra/testing`. |

## Package DAG (respected)

```
mastra ─→ core ─→ http
             ↑
bootstrap ───┘
    ↑
apps/api ─→ http
apps/cli
apps/studio (mastra only)
```

Almost all Phase 0–4 work happens inside `packages/mastra/`. The single exception is Task 0.3 (dataset/Experiments wiring) and Task 4.5 (`mcpServers` registration), both of which add a small block to `apps/studio/src/mastra/index.ts`. Phase 5 touches `apps/api` + `apps/cli`. `core`, `http`, `bootstrap`, `apps/console` are not modified.

---

## Model tiers and per-piece assignment

Different pieces have different model requirements: trivial agents waste cycles on a strong model, while multi-hop reasoning collapses on a tiny one. Pick the smallest tier that does the job, override per-env when validating, and pay the cost for judges (where quality dictates eval signal). The starter is local-first by default — every tier resolves to an Ollama model so the gallery runs offline; cloud models are demoed via `mcp-agent`'s pro-tier swap.

### Tiers

Tier names are bare strings (no `chat:` prefix), passed to `getChatModel(tier)`. Cloud namespace uses `cloud-` prefix for forward-compat (sibling slots reserved below).

| Tier | Default | Override env | Used for |
|---|---|---|---|
| `tiny` | `ollama:qwen2.5:1.5b` | `MASTRA_MODEL_TINY` | Trivial shells where processors / scripts do the work |
| `default` | `ollama:qwen2.5:3b` *(existing `MASTRA_MODEL`)* | `MASTRA_MODEL` | Workhorse chat / structured output / single-hop RAG |
| `strong` | `ollama:qwen2.5:7b` | `MASTRA_MODEL_STRONG` | Multi-hop reasoning, routing, dynamic-upgrade demo |
| `judge` | `ollama:qwen2.5:14b` *(existing `MASTRA_JUDGE_MODEL`)* | `MASTRA_JUDGE_MODEL` | LLM-judge scorers (`AnswerRelevancyScorer`, `FaithfulnessScorer`, `HallucinationScorer`, custom citation judge) |
| `embed` | `ollama:nomic-embed-text` *(existing `MASTRA_EMBEDDER`)* | `MASTRA_EMBEDDER` | Vector embeddings for RAG + graph-RAG |
| `cloud-strong` | `claude-sonnet-4-6` | `MASTRA_CLOUD_STRONG_MODEL` | Cloud demo path — only `mcp-agent` pro tier and explicit overrides |
| `cloud-default` | *(reserved — not wired)* | *(reserved)* | Future cloud workhorse slot |
| `cloud-judge` | *(reserved — not wired)* | *(reserved)* | Future cloud judge slot for high-fidelity eval signal |

The first three (`tiny` / `default` / `strong`) plus `judge` and `embed` form the local-only path that CI and `bun run test:evals` use. `cloud-strong` is opt-in and only resolved when `mcp-agent` receives `requestContext: { tier: 'pro' }`. Reserved cloud slots exist so a future addition (e.g. cloud judge for higher eval signal) doesn't break the namespace.

**Tiny-tier promotion rule**: if `tiny` produces invalid Zod-shaped output >5% of runs across a piece's eval test, promote that piece to `default` in the per-piece table. Centralized change, no factory rewrite.

### Per-piece assignment

| Piece | Chat tier | Judge tier | Embed | Why |
|---|---|---|---|---|
| `echo-agent` | `tiny` | `judge` (eval only) | — | Trivial structured output; no reasoning |
| `memory-agent` | `default` | `judge` (eval only) | — | Persona summarization needs coherence |
| `guardrail-agent` | `tiny` | `judge` (eval only) | — | Processor stack is the test surface; agent shell is trivial |
| `rag-agent` | `default` | `judge` (citation scorer's `analyze` step + default scorers) | `embed` | Single-hop synthesis + citation |
| `graph-rag-agent` | `strong` | `judge` (eval only) | `embed` | Multi-hop traversal needs a stronger reasoner |
| `mcp-agent` (free) | `default` | `judge` (eval only) | — | Baseline path |
| `mcp-agent` (pro) | `cloud-strong` | `judge` (eval only) | — | Demonstrates dynamic resolver model swap (Ollama → Claude) |
| `supervisor-agent` | `strong` | `judge` (eval only) | — | Routing decisions need to be reliable |
| `control-flow-workflow` | **none** | **none** (scorer is deterministic) | — | Pure deterministic pipeline |
| `hitl-workflow` | `default` | `judge` (default workflow scorers) | — | Quote drafting + edit-application |
| `sandbox-workflow` | **none** | **none** (deterministic shape scorer) | — | `tsc` + LSP produce the output |

Notes:

- **Scorers always use the `judge` tier regardless of the agent's chat tier** — chat tier and judge tier are independent dimensions.
- "Judge tier (eval only)" means the judge model is used inside `*.eval.test.ts` (gated behind `HARNESS_EVAL=1`) and inside Studio's Evals tab when a scored run completes. It is not part of the agent's chat path.
- Workflows with `chat tier: none` still appear in Studio's Traces tab — there's just no LLM span. Their scorers are deterministic so judge tier is also `none`.
- The `cloud-strong` row is the only place this plan reaches outside Ollama. If a developer wants to validate other pieces against Claude, the override envs above swap them transparently.

### Resolution helper

A new `runtime/models.ts` helper exposes typed accessors so each agent factory imports the right tier without inlining model-id strings:

```ts
import {
  getChatModel,            // takes a tier: 'tiny' | 'default' | 'strong' | 'cloud-strong'
  getJudgeModel,
  getEmbedder,
} from '@harness/mastra/runtime';

const echoModel       = getChatModel('tiny');
const supervisorModel = getChatModel('strong');
const judge           = getJudgeModel();
const embedder        = getEmbedder();
```

This is wired in Task 0.3 (below). Every agent factory in Phases 1–4 imports from here rather than reading env vars directly, so model swapping stays centralized.

### Local hardware footprint

Default tier set assumes ~16 GB free VRAM (or unified memory) if every model loads concurrently:

| Tier | Default model | Approx. size |
|---|---|---|
| `tiny` | `qwen2.5:1.5b` | ~1 GB |
| `default` | `qwen2.5:3b` | ~2 GB |
| `strong` | `qwen2.5:7b` | ~4.5 GB |
| `judge` | `qwen2.5:14b` | ~9 GB |
| `embed` | `nomic-embed-text` | ~0.3 GB |

Lighter setups should override:

```bash
# 8 GB box — accept noisier eval signal, slower strong-tier reasoning
export MASTRA_JUDGE_MODEL=ollama:qwen2.5:7b
export MASTRA_MODEL_STRONG=ollama:qwen2.5:3b
```

Models load on first use, not at boot, so peak memory only happens when an eval test runs across multiple tiers in one process.

---

## Studio verification protocol (per-piece)

Every agent and workflow must be fully exercisable from Studio before its task is "done". Task 1.1 (`echo-agent`) establishes the template; every later task copies it.

### The four "Studio-green" checks

After `bun run studio:dev` (`http://localhost:4111`), every piece must pass all four:

1. **Discoverable** — appears in Studio's Agents/Workflows tab via the `allAgents` / `allWorkflows` barrel.
2. **Runnable** — at least one demo input from the task's acceptance criteria completes (`success` / `suspended` / `tripwire`).
3. **Traced** — Traces tab shows a span tree for the run. Probe template (Task 1.1 verifies the canonical query against real spans and updates this template before Task 1.2 starts):
   ```sql
   -- Initial probe (verify in Task 1.1):
   SELECT count(*) FROM mastra_ai_spans
   WHERE attributes->>'componentName' = '<piece-id>'
     AND parent_span_id IS NULL;
   ```
   Workflow runs additionally show step + `writer.write` events.
4. **Scored** — Evals tab shows scorer rows (agents construct with `scorers: defaultAgentScorers(model)`); for dataset-backed pieces, Experiments tab runs the dataset.

If a piece can't take the standard scorer path (e.g. workflows have no constructor `scorers` field per CLAUDE.md), the task description **must** call out the deviation and document the alternative (e.g. "scorers wired per-step via `step.scorer(...)`"). Silent omissions break the template for every later piece.

### Dataset registration

Every `*.dataset.ts` under `src/evals/datasets/` registers via the `allDatasets` barrel (Task 0.4) and is consumed by `apps/studio/src/mastra/index.ts`. If the pinned Mastra version doesn't surface dataset registration, the fallback is a `scripts/run-experiment.ts` per piece that loads the dataset, invokes the piece, and persists results to the shared LibSQL DB (so Traces tab remains the comparison surface).

**Dataset sizing guidance:**
- Deterministic scorer: 3–5 entries (just enough to cover branches).
- LLM-judged scorer: ≥10 entries (signal-to-noise across stochastic judge output).
- Routing / intent dataset: ≥1 entry per intent class, plus 1 negative.

If checks 2–4 fail, **the task is not done** — debug before moving on, because every later piece copies this template.

---

## Conventions for Phase 1–4 tasks

These apply to every Phase 1–4 task and are not relisted per task:

- **Models** — every factory imports `getChatModel(<tier>)` / `getJudgeModel()` / `getEmbedder()` from `@harness/mastra/runtime`. Implicit dependency on Task 0.3.
- **Datasets** — every task that ships an `*.dataset.ts` registers it via the `allDatasets` barrel. Implicit dependency on Task 0.4.
- **Studio verification** — every task closes only when all four Studio-green checks pass (see protocol above).
- **Per-piece file template** — copy the layout from the previous piece in build order; deviations must be called out in the task description.

---

## Task list

### Phase 0 — Foundation helpers

Five Phase 0 tasks land the shared infra that every later piece imports against: the MCP dep (0.0), vector + memory helpers (0.1, 0.2), the per-tier model resolver (0.3), and the dataset/Experiments wiring (0.4). The MCP **client** helper is deferred to Phase 3 (needs the stub server to point at), but the dep that ships both `MCPServer` and `MCPClient` lands here so later tasks can `import` cleanly.

#### Task 0.0: Add `@mastra/mcp` dependency + `reset:db` script

**Description:** Add `@mastra/mcp` to `packages/mastra/package.json` deps, pinned to a version compatible with `@mastra/core@1.27.0`. Verify import works for both `MCPServer` and `MCPClient`. Also add a root `bun run reset:db` script (`rm -f .mastra/mastra.db`) so the recovery path documented in the working-memory risks row is one command.

**Acceptance criteria:**
- [ ] `@mastra/mcp` appears in `packages/mastra/package.json` `dependencies` with a pinned exact version
- [ ] `import { MCPServer, MCPClient } from '@mastra/mcp'` typechecks
- [ ] `bun.lock` is committed
- [ ] `bun install` from a clean checkout pulls the new dep without conflict against `@mastra/core@1.27.0`
- [ ] Root `package.json` has a `reset:db` script that deletes `.mastra/mastra.db`

**Verification:**
- [ ] `bun install` clean
- [ ] `bun run typecheck` passes
- [ ] `bun run build` passes
- [ ] `bun run reset:db` removes the DB file and exits 0 (idempotent — second run does not error)

**Dependencies:** None
**Files likely touched:**
- `packages/mastra/package.json`
- root `package.json` (add `reset:db` script)
- `bun.lock`
**Estimated scope:** XS (3 files)

---

#### Task 0.1: Add `createMastraVector()` helper

**Description:** New helper in `packages/mastra/src/runtime/` returning a `LibSQLVector` configured to use the same DB path as `createMastraStorage()`. Both `rag-agent` and `graph-rag-agent` share this single vector instance with separate index names.

**Acceptance criteria:**
- [ ] `createMastraVector()` returns a `LibSQLVector` instance
- [ ] DB URL resolution mirrors `createMastraStorage()` (walks up to repo root via `bun.lock`/`biome.json`; respects `MASTRA_DB_URL` env)
- [ ] Exported from `@harness/mastra/runtime`

**Verification:**
- [ ] Unit test: `bun test packages/mastra/src/runtime/vector.test.ts`
- [ ] Typecheck: `bun run typecheck`
- [ ] Build: `bun run build`

**Dependencies:** None
**Files likely touched:**
- `packages/mastra/src/runtime/vector.ts` (new) — uses `LibSQLVector` from existing `@mastra/libsql@1.9.0`
- `packages/mastra/src/runtime/vector.test.ts` (new)
- `packages/mastra/src/runtime/index.ts` (export)
**Estimated scope:** Small (3 files)

---

#### Task 0.2: Add `createDefaultMemory({ storage })` helper

**Description:** New helper in `runtime/` returning a `Memory` instance with sensible portfolio defaults: `lastMessages: 20`, semantic recall enabled, working memory enabled, observational memory enabled, `TokenLimiter` + `ToolCallFilter` processors. Per-agent overrides happen at agent factory level.

**Acceptance criteria:**
- [ ] `createDefaultMemory({ storage })` returns `Memory` with all 5 features wired
- [ ] Working memory uses a generic profile schema (subclass override available)
- [ ] Exported from `@harness/mastra/runtime`

**Verification:**
- [ ] Unit test: `bun test packages/mastra/src/runtime/memory.test.ts`
- [ ] Typecheck + build pass

**Dependencies:** Task 0.1 (shares storage helpers)
**Files likely touched:**
- `packages/mastra/src/runtime/memory.ts` (new)
- `packages/mastra/src/runtime/memory.test.ts` (new)
- `packages/mastra/src/runtime/index.ts` (export)
**Estimated scope:** Small (3 files)

---

#### Task 0.3: Add `runtime/models.ts` tier helper

**Description:** New helper in `runtime/` exposing `getChatModel(tier)`, `getJudgeModel()`, `getEmbedder()`. Encapsulates the env-resolution logic for the 6 wired tiers in the "Model tiers" table (`tiny`, `default`, `strong`, `cloud-strong`, `judge`, `embed`). Default values match that table; env overrides match too. Cloud-tier resolution lazy-loads `@ai-sdk/anthropic` so local-only runs never reach for cloud creds. Reserved tiers (`cloud-default`, `cloud-judge`) are typed in the union but throw a "not yet wired" error at resolution time.

**Acceptance criteria:**
- [ ] `getChatModel('tiny' | 'default' | 'strong' | 'cloud-strong')` returns a `LanguageModelV2` instance
- [ ] `getJudgeModel()` returns the judge model (defaults to `MASTRA_JUDGE_MODEL`)
- [ ] `getEmbedder()` returns the embedder (defaults to `MASTRA_EMBEDDER`)
- [ ] Cloud tier resolution throws a clear error if `ANTHROPIC_API_KEY` is unset (no silent fallback)
- [ ] Reserved cloud tiers (`cloud-default`, `cloud-judge`) accept the type but throw `not yet wired` at resolution
- [ ] Exported from `@harness/mastra/runtime`

**Verification:**
- [ ] Unit test: `bun test packages/mastra/src/runtime/models.test.ts` — covers all 4 chat tiers + judge + embedder, env override per tier, cloud-tier-without-key error
- [ ] Typecheck + build pass

**Dependencies:** None (this task locks the contract every Phase 1–4 agent imports against, so land it before Task 1.1)
**Files likely touched:**
- `packages/mastra/src/runtime/models.ts` (new)
- `packages/mastra/src/runtime/models.test.ts` (new)
- `packages/mastra/src/runtime/index.ts` (export)
**Estimated scope:** Small (3 files)

---

#### Task 0.4: Wire `allDatasets` barrel + Studio Experiments integration

**Description:** Create `packages/mastra/src/evals/datasets/index.ts` exporting an empty `allDatasets` barrel. Update `apps/studio/src/mastra/index.ts` to register datasets with the `Mastra` instance (via whatever config key the pinned `@mastra/core@1.27.0` exposes — verify during the task). If Mastra doesn't surface dataset registration, document the fallback: each piece ships a `scripts/run-experiment.ts` that loads its dataset, invokes the piece, and persists results into the shared LibSQL DB so traces remain comparable.

**Acceptance criteria:**
- [ ] `allDatasets` barrel exists and is consumed by `apps/studio/src/mastra/index.ts`
- [ ] One throwaway dummy dataset registered to verify Studio's Experiments tab actually surfaces it (delete after verification)
- [ ] If Mastra version doesn't support dataset registration, fallback `run-experiment.ts` template documented in this plan and a stub committed under `packages/mastra/src/evals/datasets/_template/`

**Verification:**
- [ ] `bun run studio:dev` → Experiments tab lists the dummy dataset
- [ ] Removing the dummy keeps the barrel green for future task additions

**Dependencies:** None
**Files likely touched:**
- `packages/mastra/src/evals/datasets/index.ts` (new)
- `apps/studio/src/mastra/index.ts` (updated — only file outside `packages/mastra` touched in Phase 0)
**Estimated scope:** Small (2 files)

---

### Checkpoint: Foundation
- [ ] `bun run ci` passes
- [ ] Helpers exported and importable from `@harness/mastra/runtime`
- [ ] Studio entry (`apps/studio/src/mastra/index.ts`) still works; Experiments tab is wired (even if empty)
- [ ] Studio verification protocol from top-of-doc is now mechanically supported (barrel + dataset wiring in place)
- [ ] Human review

---

### Phase 1 — Agent fundamentals (pieces 1–3)

Three agents that establish the per-piece template: factory + unit test + eval test + barrel registration + tier-correct model import. Each task is one full vertical slice. (See "Conventions for Phase 1–4 tasks" above for implicit deps on Tasks 0.3 + 0.4.)

#### Task 1.1: Build `echo-agent` (capability template)

**Description:** Smallest-possible Agent with Zod `structuredOutput` for `{intent, payload, tokens}`. No tools, no memory. **Model tier: `chat:tiny`** (factory imports `getChatModel('tiny')` from `@harness/mastra/runtime`). **This task locks the template every later agent copies** — file layout, test shape, model-tier import, and the four-point Studio verification block (per "Studio verification protocol" above).

**Acceptance criteria:**
- [ ] `createEchoAgent({ model, scorers? })` returns `Agent` with `structuredOutput.schema`
- [ ] Defaults `scorers` to `defaultAgentScorers(model)` (locks the "Scored" verification step for every later agent)
- [ ] Wired into `allAgents` barrel as `echoAgent` (locks the "Discoverable" step)
- [ ] Returns valid Zod-shaped output for "Hello there"

**Verification:**
- [ ] Unit test (mockModel): `bun test packages/mastra/src/agents/echo-agent.test.ts`
- [ ] Eval test (gated): `HARNESS_EVAL=1 bun test packages/mastra/src/agents/echo-agent.eval.test.ts`
- [ ] **Studio verification (all must pass — this is the canonical template):**
  - [ ] Discoverable: `bun run studio:dev` → echo agent appears in Agents tab
  - [ ] Runnable: chat with "Hello there" → structured output returned
  - [ ] Traced: Traces tab shows a span tree. **Pin the canonical probe query**: after a successful run, inspect `.mastra/mastra.db` directly (`sqlite3 .mastra/mastra.db ".schema mastra_ai_spans"` + sample rows) to confirm the actual column / attribute that identifies the agent. Update the Studio protocol's probe template (currently `attributes->>'componentName'`) with the verified shape before Task 1.2 starts.
  - [ ] Scored: Evals tab shows `AnswerRelevancyScorer` + `ContentSimilarityScorer` rows with numeric scores

**Dependencies:** None (uses existing `defaultAgentScorers`)
**Files likely touched:**
- `packages/mastra/src/agents/echo-agent.ts` (new)
- `packages/mastra/src/agents/echo-agent.test.ts` (new)
- `packages/mastra/src/agents/echo-agent.eval.test.ts` (new)
- `packages/mastra/src/agents/index.ts` (add to `allAgents`)
**Estimated scope:** Small (4 files)

---

#### Task 1.2: Build `memory-agent` (Memory template)

**Description:** Persona-profile chat using `createDefaultMemory()`. Override the working-memory schema with `PersonaProfile` Zod. `scope: 'resource'` for both working memory and semantic recall. **Model tier: `chat:default`** (`getChatModel('default')`).

**Acceptance criteria:**
- [ ] `createMemoryAgent({ model, memory })` accepts injected memory
- [ ] Working memory schema is `PersonaProfile` (`name?`, `timezone?`, `preferredTone`, `knownTopics`)
- [ ] Wired into `allAgents` barrel; barrel constructs default memory via `createDefaultMemory()`
- [ ] Across two threads (same `resourceId`), the agent recalls profile from thread 1 in thread 2
- [ ] `generateTitle` produces a non-empty title

**Verification:**
- [ ] Unit test (mockModel + in-memory storage): `bun test packages/mastra/src/agents/memory-agent.test.ts`
- [ ] Eval test (gated): asserts cross-thread recall
- [ ] **Studio verification (per protocol):**
  - [ ] Discoverable: appears in Studio's Agents tab
  - [ ] Runnable: 2 threads under the same `resourceId` → second thread recalls profile from first
  - [ ] Traced: Traces tab shows working-memory + semantic-recall spans for both runs
  - [ ] Scored: Evals tab shows scorer rows from `defaultAgentScorers(model)`

**Dependencies:** Task 0.2
**Files likely touched:**
- `packages/mastra/src/agents/memory-agent.ts` (new)
- `packages/mastra/src/agents/memory-agent.test.ts` (new)
- `packages/mastra/src/agents/memory-agent.eval.test.ts` (new)
- `packages/mastra/src/agents/index.ts` (export, barrel update)
**Estimated scope:** Small (4 files)

---

#### Task 1.3: Build `guardrail-agent` (processor stack)

**Description:** Trivial-purpose Agent with full input processor stack (`UnicodeNormalizer`, `LanguageDetector`, `PIIDetector`, `PromptInjectionDetector`, `ModerationProcessor`) and `SensitiveDataFilter` output processor. Tripwire on injection / moderation / unsupported language. PII redacts in place. **Model tier: `chat:tiny`** (processors do the test work; agent shell is trivial).

**Acceptance criteria:**
- [ ] `createGuardrailAgent({ model })` returns Agent with processor stack
- [ ] PII prompt → input visibly redacted before model
- [ ] Injection prompt → run ends in `tripwire` status with `reason`
- [ ] Non-English prompt (e.g. `"Bonjour"`) → tripwire `language not allowed`
- [ ] Wired into `allAgents` barrel

**Verification:**
- [ ] Unit test: 4 prompts, 4 expected outcomes (one normal, three trip variants)
- [ ] **Studio verification (per protocol):**
  - [ ] Discoverable: appears in Studio's Agents tab
  - [ ] Runnable: send the 4 demo prompts; each terminates as expected (1 normal, 3 tripwires)
  - [ ] Traced: Traces tab shows the processor stack and tripwire reason on each tripped run
  - [ ] Scored: Evals tab shows `defaultAgentScorers(model)` rows on the normal run

**Dependencies:** None (processors come from `@mastra/core`)
**Files likely touched:**
- `packages/mastra/src/agents/guardrail-agent.ts` (new)
- `packages/mastra/src/agents/guardrail-agent.test.ts` (new)
- `packages/mastra/src/agents/guardrail-agent.eval.test.ts` (new)
- `packages/mastra/src/agents/index.ts`
**Estimated scope:** Small (4 files)

---

### Checkpoint: Agent fundamentals
- [ ] `bun run ci` passes
- [ ] Three new agents Studio-green per protocol (Discoverable / Runnable / Traced / Scored)
- [ ] Per-piece file template established (factory + unit test + eval test + barrel update + Studio verification block)
- [ ] Confirm a developer can copy `echo-agent` files, rename, and reach Studio-green for a hypothetical new piece without consulting the plan
- [ ] Human review of template before scaling

---

### Phase 2 — RAG pieces (4–5)

Two pieces share vector infrastructure. Land RAG first (sets corpus + seed pattern), then GraphRAG (reuses store, adds graph traversal).

#### Task 2.1: Build `rag-agent` corpus + seed pipeline

**Description:** Scaffold `agents/rag-agent/` folder with 5 fictional Acme Vacuum 3000 markdown docs (frontmatter: `section`, `last_updated`). Add `seed.ts` (idempotent: chunk → embed → upsert into `LibSQLVector` index `acme_docs`). Add root `bun run rag:seed` script.

**Acceptance criteria:**
- [ ] 5 markdown docs ship at `packages/mastra/src/agents/rag-agent/corpus/*.md`, ~200 words each
- [ ] `seed.ts` chunks with `MDocument.fromMarkdown` + markdown strategy (size 512, overlap 50)
- [ ] Embeds with Ollama `nomic-embed-text` by default; `MASTRA_EMBEDDER` env override works
- [ ] Idempotent: running twice doesn't duplicate
- [ ] `bun run rag:seed` creates `acme_docs` index in shared `.mastra/mastra.db`

**Verification:**
- [ ] Unit test: `bun test packages/mastra/src/agents/rag-agent/seed.test.ts` (mocks embedder; asserts chunk count + metadata shape)
- [ ] Manual: `bun run rag:seed` → `sqlite3 .mastra/mastra.db "select count(*) from libsql_vector;"` shows N chunks

**Dependencies:** Task 0.1
**Files likely touched:**
- `packages/mastra/src/agents/rag-agent/corpus/{specs,troubleshooting,warranty,accessories,faq}.md` (new × 5)
- `packages/mastra/src/agents/rag-agent/seed.ts` (new)
- `packages/mastra/src/agents/rag-agent/seed.test.ts` (new)
- root `package.json` (add `rag:seed` script)
**Estimated scope:** Medium (8 files)

---

#### Task 2.2: Build `rag-agent` factory + custom citation scorer

**Description:** Agent factory with `createVectorQueryTool` + `rerankWithScorer` (deterministic content-similarity rerank). Custom `citation-format` scorer using full `createScorer` chain (preprocess regex → analyze LLM judge → score precision → reason). 10-entry dataset. **Model tiers: chat = `chat:default`; embedder = `embed`; citation scorer's `analyze` step = `judge`** (`getChatModel('default')` + `getEmbedder()` + `getJudgeModel()`).

**Acceptance criteria:**
- [ ] `createRagAgent({ model, vector, memory })` returns Agent with vector query + rerank
- [ ] Citation scorer uses all four `createScorer` steps
- [ ] Wired into `allAgents` barrel
- [ ] Studio chat: "What's the warranty period?" returns answer with `[doc:warranty.md]` citation
- [ ] 10-entry dataset visible in Studio Experiments

**Verification:**
- [ ] Unit test (mockModel + in-memory vector seed): `bun test packages/mastra/src/agents/rag-agent/agent.test.ts`
- [ ] Scorer unit test: `bun test packages/mastra/src/agents/rag-agent/scorer.test.ts`
- [ ] Eval test gated: asserts citation precision ≥ 0.7 across dataset
- [ ] **Studio verification (per protocol):**
  - [ ] Discoverable: appears in Studio's Agents tab; `rag-agent.dataset.ts` registered + visible in Experiments tab
  - [ ] Runnable: "What's the warranty period?" returns answer with `[doc:warranty.md]` citation
  - [ ] Traced: Traces tab shows vector-query + rerank spans + citation-format scorer span
  - [ ] Scored: Evals tab shows `citation-format` + `defaultAgentScorers` rows; Experiments tab can run the 10-entry dataset end-to-end

**Dependencies:** Tasks 0.1, 0.2, 2.1
**Files likely touched:**
- `packages/mastra/src/agents/rag-agent/agent.ts` (new)
- `packages/mastra/src/agents/rag-agent/scorer.ts` (new)
- `packages/mastra/src/agents/rag-agent/index.ts` (new)
- `packages/mastra/src/agents/rag-agent/agent.test.ts` (new)
- `packages/mastra/src/agents/rag-agent/scorer.test.ts` (new)
- `packages/mastra/src/agents/rag-agent/agent.eval.test.ts` (new)
- `packages/mastra/src/evals/datasets/rag-agent.dataset.ts` (new)
- `packages/mastra/src/agents/index.ts` (barrel)
**Estimated scope:** Medium (8 files)

---

#### Task 2.3: Build `graph-rag-agent` (multi-hop)

**Description:** 9 fictional org-universe docs with cross-references. Same vector store as RAG, separate index `org_graph`. `createGraphRAGTool` with documented graph options. `bun run graph-rag:seed` script. **Model tiers: chat = `chat:strong`** (multi-hop reasoning); **embedder = `embed`**.

**Acceptance criteria:**
- [ ] 9 markdown docs ship at `packages/mastra/src/agents/graph-rag-agent/corpus/` (3 companies + 3 people + 3 products), ~120 words each, prose cross-references, frontmatter `type`
- [ ] `seed.ts` chunks with size 256/overlap 30 + `extract: { keywords, summary }`
- [ ] `seed.ts` *probes* the embedder dimension via R4's pattern; the value is not hardcoded
- [ ] `createGraphRAGTool` configured with `dimension: <probed>`, `threshold: 0.7`, `randomWalkSteps: 100`, `restartProb: 0.15`. The expected value for the default `nomic-embed-text` embedder is 768 — used as a sanity assertion in the seed test, not as a literal in tool config
- [ ] Wired into `allAgents` barrel
- [ ] Studio: 3-hop query "Which companies employ designers of Acme's products?" returns sensible traversal

**Verification:**
- [ ] Unit test (mockModel + seeded in-memory vector)
- [ ] Eval test gated: 4 demo queries (1, 1-reverse, 2, 3 hops) — assert top-1 retrieval correctness
- [ ] **Studio verification (per protocol):**
  - [ ] Discoverable: appears in Studio's Agents tab; `graph-rag-agent.dataset.ts` (4-entry) registered + visible in Experiments tab
  - [ ] Runnable: 3-hop demo query returns sensible traversal in Studio chat
  - [ ] Traced: Traces tab shows graph-traversal spans (random walk steps logged)
  - [ ] Scored: Evals tab shows `defaultAgentScorers` rows; Experiments tab can run the 4 demo queries

**Dependencies:** Tasks 0.1, 2.1 (vector infra pattern)
**Files likely touched:**
- `packages/mastra/src/agents/graph-rag-agent/corpus/*.md` (new × 9)
- `packages/mastra/src/agents/graph-rag-agent/agent.ts` (new)
- `packages/mastra/src/agents/graph-rag-agent/seed.ts` (new)
- `packages/mastra/src/agents/graph-rag-agent/index.ts` (new)
- `packages/mastra/src/agents/graph-rag-agent/{agent,seed}.test.ts` (new × 2)
- `packages/mastra/src/agents/graph-rag-agent/agent.eval.test.ts` (new)
- `packages/mastra/src/agents/index.ts`
- root `package.json` (add `graph-rag:seed`)
**Estimated scope:** Medium (16 files; 9 are short corpus markdown)

---

### Checkpoint: RAG pieces
- [ ] `bun run ci` passes
- [ ] Both seed scripts run idempotently from a fresh clone
- [ ] Two indexes coexist in same `.mastra/mastra.db`
- [ ] Both agents Studio-green per protocol; both datasets runnable from Studio's Experiments tab
- [ ] 3-hop query visibly succeeds in Studio (vs flat-RAG fail) with traces showing graph traversal
- [ ] Human review

---

### Phase 3 — MCP + supervisor (pieces 6–7)

#### Task 3.1: Build stub MCPServer process

**Description:** Standalone Bun script at `packages/mastra/src/mcp/stub-server/server.ts` exposing two tools: `get_weather(city)` (no approval) and `send_notification(channel, body)` (requires approval). In-memory state. Spawnable via stdio.

**Acceptance criteria:**
- [ ] `bun run packages/mastra/src/mcp/stub-server/server.ts` starts and accepts MCP stdio messages
- [ ] `get_weather('hanoi')` returns `{temp: 22, condition: 'sunny'}`
- [ ] `send_notification(...)` writes to in-memory outbox, returns `{id, status}`
- [ ] Tool schemas (Zod) exported for type-checking on the client side

**Verification:**
- [ ] Unit test (in-process): `bun test packages/mastra/src/mcp/stub-server/server.test.ts` — uses `MCPClient` to call both tools
- [ ] Manual: spawn the script directly, send a `tools/list` request

**Dependencies:** None
**Files likely touched:**
- `packages/mastra/src/mcp/stub-server/server.ts` (new)
- `packages/mastra/src/mcp/stub-server/server.test.ts` (new)
- `packages/mastra/src/mcp/stub-server/tools.ts` (new — shared Zod schemas)
**Estimated scope:** Small (3 files)

---

#### Task 3.2: Add `createDefaultMcpClient()` helper + barrel wiring

**Description:** Helper in `runtime/` that constructs an `MCPClient` pointing at the stub server (stdio, spawn `bun run packages/mastra/src/mcp/stub-server/server.ts`). `requireToolApproval: { stub_send_notification: true }`. Used by both `mcp-agent` and barrel default.

**Acceptance criteria:**
- [ ] `createDefaultMcpClient()` returns ready-to-use `MCPClient`
- [ ] Selective approval: `stub_get_weather` runs immediately; `stub_send_notification` requires approval
- [ ] Exported from `@harness/mastra/runtime`

**Verification:**
- [ ] Unit test: spawn stub, list tools, verify approval policy
- [ ] Typecheck + build pass

**Dependencies:** Task 3.1
**Files likely touched:**
- `packages/mastra/src/runtime/mcp-client.ts` (new)
- `packages/mastra/src/runtime/mcp-client.test.ts` (new)
- `packages/mastra/src/runtime/index.ts`
**Estimated scope:** Small (3 files)

---

#### Task 3.3: Build `mcp-agent` (runtimeContext + dynamic resolvers)

**Description:** Agent factory accepting `mcp` client. `requestContextSchema` validates `{userId, tier, locale}`. `model` resolver swaps `getChatModel('default')` → `getChatModel('cloud-strong')` when `tier === 'pro'` (concrete model ids stay in the tiers table — this task references tiers, not model strings). `instructions` resolver swaps language by `locale`. **Model tiers: chat = `default`; pro path = `cloud-strong`** — only piece that demos cloud resolution.

**Acceptance criteria:**
- [ ] `createMcpAgent({ model, mcp })` returns Agent with both dynamic resolvers
- [ ] `requestContextSchema` rejects invalid context
- [ ] Studio: same prompt with `tier: 'free'` vs `tier: 'pro'` shows different model in trace
- [ ] Studio: `locale: 'vi'` switches instructions to Vietnamese
- [ ] Eval test exercises **both** tier paths (mock `cloud-strong` resolver to avoid real cloud cost; assert correct tier resolved per `requestContext`)
- [ ] Wired into `allAgents` barrel

**Verification:**
- [ ] Unit test (mockModel + stubbed MCPClient): asserts both resolvers fire on requestContext changes
- [ ] Eval test gated
- [ ] **Studio verification (per protocol):**
  - [ ] Discoverable: appears in Studio's Agents tab
  - [ ] Runnable: same prompt with `tier: 'free'` vs `'pro'` shows different model in trace; `locale: 'vi'` swaps instructions; `send_notification` triggers approval UI → approve → completes
  - [ ] Traced: Traces tab shows model swap + MCP tool calls + approval span
  - [ ] Scored: Evals tab shows `defaultAgentScorers` rows

**Dependencies:** Tasks 3.1, 3.2
**Files likely touched:**
- `packages/mastra/src/agents/mcp-agent.ts` (new)
- `packages/mastra/src/agents/mcp-agent.test.ts` (new)
- `packages/mastra/src/agents/mcp-agent.eval.test.ts` (new)
- `packages/mastra/src/agents/index.ts`
**Estimated scope:** Small (4 files)

---

#### Task 3.4: Build `supervisor-agent` (delegation hooks)

**Description:** Supervisor binds `ragAgent`, `graphRagAgent`, `mcpAgent` via `agents:{}`. All four delegation hook usages (PII redact + off-topic reject in `onDelegationStart`; quality bail in `onDelegationComplete`; `messageFilter` for mcpAgent only). Observational memory + thread-scoped working memory (deliberate contrast with `memory-agent`). **Model tier: `chat:strong`** — routing reliability matters; cheaper tiers misroute.

**Acceptance criteria:**
- [ ] `createSupervisorAgent({ model, subagents: { ragAgent, graphRagAgent, mcpAgent } })` returns Agent
- [ ] Routing instructions delegate to one of three subagents based on intent
- [ ] PII prompt → `onDelegationStart` rewrites prompt before delegation; trace shows the rewrite
- [ ] Off-topic prompt → `onDelegationStart` rejects with reason
- [ ] Empty subagent response → `onDelegationComplete.bail()` fires
- [ ] mcpAgent subagent receives filtered messages (no prior assistant turns)
- [ ] Wired into `allAgents` (barrel constructs subagents first, then supervisor)

**Verification:**
- [ ] Unit test (mockModel for each subagent, scripted delegation outcomes)
- [ ] Eval test gated: 5 prompts → asserts correct delegation target per prompt
- [ ] **Studio verification (per protocol):**
  - [ ] Discoverable: appears in Studio's Agents tab; 5-prompt dataset registered + visible in Experiments tab
  - [ ] Runnable: 5 demo prompts → each routes to expected subagent (rag / graph-rag / mcp)
  - [ ] Traced: Traces tab shows `delegation_start` → subagent span tree → `delegation_complete`; PII redact + bail events visible
  - [ ] Scored: Evals tab shows `defaultAgentScorers` rows on supervisor; Experiments tab runs the 5-prompt routing dataset

**Dependencies:** Tasks 1.2, 2.2, 2.3, 3.3
**Files likely touched:**
- `packages/mastra/src/agents/supervisor-agent.ts` (new)
- `packages/mastra/src/agents/supervisor-agent.test.ts` (new)
- `packages/mastra/src/agents/supervisor-agent.eval.test.ts` (new)
- `packages/mastra/src/agents/index.ts` (barrel — supervisor depends on others built first)
**Estimated scope:** Medium (4 files; supervisor logic is dense)

---

### Checkpoint: MCP + supervisor
- [ ] `bun run ci` passes
- [ ] All 7 agents Studio-green per protocol
- [ ] Approval flow works end-to-end (Studio approval UI → tool call resumes; trace span captures approval)
- [ ] Supervisor traces show 3-way routing with delegation hooks visible
- [ ] All registered datasets runnable from Studio's Experiments tab
- [ ] Human review

---

### Phase 4 — Workflows (pieces 8–10)

#### Task 4.1: Build `control-flow-workflow` (every primitive)

**Description:** Deterministic word-stats pipeline using all 8 control primitives + nested workflow + streaming. Tripwire on empty/oversized input. 5-entry dataset. **Model tier: none** (pure deterministic; no model spans in the trace).

**Acceptance criteria:**
- [ ] Workflow uses every primitive: `.then` `.map` `.parallel` `.branch` `.foreach` `.dountil` `.dowhile` `.sleep`
- [ ] Per-sentence work runs as a nested workflow inside `.foreach` (concurrency 2)
- [ ] Every step boundary emits a `writer.write` progress event
- [ ] Empty input or sentence > 10k chars → run ends `tripwire` with structured `reason`
- [ ] Wired into `allWorkflows` barrel

**Verification:**
- [ ] Unit test: feeds 3 inputs (small, large, malformed) → asserts shape + tripwire
- [ ] Eval test gated: deterministic, runs over 5-entry dataset
- [ ] **Studio verification (per protocol — workflow variant):**
  - [ ] Discoverable: appears in Studio's Workflows tab; `control-flow.dataset.ts` registered + visible in Experiments tab
  - [ ] Runnable: small / large / malformed inputs each terminate as expected (success / success / tripwire)
  - [ ] Traced: Traces tab shows fan-out, branch decision, foreach iterations (concurrency 2), dountil loop, nested per-sentence workflow span; `writer.write` events appear in timeline
  - [ ] Scored: scorer is wired per-run (Task 4.2 attaches `stats-coverage` deterministic scorer); after Task 4.2 lands, Evals/Experiments tab shows scorer rows

**Dependencies:** None (pure deterministic logic)
**Files likely touched:**
- `packages/mastra/src/workflows/control-flow/workflow.ts` (new)
- `packages/mastra/src/workflows/control-flow/per-sentence.workflow.ts` (new — nested)
- `packages/mastra/src/workflows/control-flow/index.ts` (new)
- `packages/mastra/src/workflows/control-flow/workflow.test.ts` (new)
- `packages/mastra/src/workflows/control-flow/workflow.eval.test.ts` (new)
- `packages/mastra/src/evals/datasets/control-flow.dataset.ts` (new)
- `packages/mastra/src/workflows/index.ts` (barrel)
**Estimated scope:** Medium (7 files)

---

#### Task 4.2: Add `control-flow` custom scorer + `cloneWorkflow` replay script

**Description:** Deterministic `stats-coverage` scorer (no LLM) using full `createScorer` chain. `bun run wf:replay <runId>` script using `cloneWorkflow(controlFlow, { id })` to re-run from a chosen step.

**Acceptance criteria:**
- [ ] Scorer uses preprocess + analyze + generateScore + generateReason; all deterministic
- [ ] Scorer attached to control-flow workflow (per-step or end)
- [ ] `bun run wf:replay <runId>` reads snapshot from LibSQL, calls `cloneWorkflow`, re-runs from a step argument
- [ ] Replay produces a new run with a distinct ID

**Verification:**
- [ ] Unit test: scorer over 3 hand-crafted outputs (consistent / inconsistent / partial)
- [ ] Manual: run control-flow once → `bun run wf:replay <runId>` → new run shows up in Studio
- [ ] **Studio verification (closes the workflow scoring loop):**
  - [ ] Scored: after this task lands, Evals tab on `control-flow-workflow` shows `stats-coverage` scorer rows; Experiments tab runs the 5-entry dataset with scorer output
  - [ ] Replay traced: replayed run appears as a distinct run in Traces tab with its own span tree

**Dependencies:** Task 4.1
**Files likely touched:**
- `packages/mastra/src/workflows/control-flow/scorer.ts` (new)
- `packages/mastra/src/workflows/control-flow/scorer.test.ts` (new)
- `packages/mastra/src/workflows/control-flow/scripts/replay.ts` (new)
- root `package.json` (add `wf:replay`)
**Estimated scope:** Small (4 files)

---

#### Task 4.3: Build `hitl-workflow` (suspend/resume + snapshots)

**Description:** Quote-approval workflow with rich Zod `suspendSchema` + `resumeSchema`. Three-way `.branch` on resume payload (approved / approved-with-edits / rejected). `shouldPersistSnapshot: true` enables Studio time-travel. **Model tier: `chat:default`** for the drafting / edit-application steps; `judge` tier for `defaultWorkflowScorers(model)`.

**Acceptance criteria:**
- [ ] All four schemas declared (`inputSchema`, `suspendSchema`, `resumeSchema`, `outputSchema`)
- [ ] Workflow reaches `suspended` status with `draft` payload
- [ ] Resume with `{approved: true}` → `finalize` branch
- [ ] Resume with `{approved: true, edits: {...}}` → `applyEditsThenFinalize` branch
- [ ] Resume with `{approved: false}` → `recordRejection` branch
- [ ] Snapshots persist; Studio "replay from step" works
- [ ] `defaultWorkflowScorers(model)` attached
- [ ] Wired into `allWorkflows` barrel

**Verification:**
- [ ] Unit test: 3 resume scenarios → 3 distinct outputs
- [ ] Eval test gated: 3-entry dataset
- [ ] **Studio verification (per protocol — workflow variant):**
  - [ ] Discoverable: appears in Studio's Workflows tab; `hitl.dataset.ts` registered + visible in Experiments tab
  - [ ] Runnable: 3 resume scenarios from Studio UI (approve / approve-with-edits / reject) → 3 distinct branches complete
  - [ ] Traced: Traces tab shows `suspended` → resume → branch span; snapshots persist (verify time-travel "replay from step" works)
  - [ ] Scored: `defaultWorkflowScorers(model)` attached per-step; Evals tab shows scorer rows on each completed branch

**Dependencies:** None
**Files likely touched:**
- `packages/mastra/src/workflows/hitl/workflow.ts` (new)
- `packages/mastra/src/workflows/hitl/schemas.ts` (new)
- `packages/mastra/src/workflows/hitl/index.ts` (new)
- `packages/mastra/src/workflows/hitl/workflow.test.ts` (new)
- `packages/mastra/src/workflows/hitl/workflow.eval.test.ts` (new)
- `packages/mastra/src/evals/datasets/hitl.dataset.ts` (new)
- `packages/mastra/src/workflows/index.ts`
**Estimated scope:** Medium (7 files)

---

#### Task 4.4: Build `sandbox-workflow` (Workspaces + LSP)

**Description:** TS type-check pipeline. Workspace with `LocalFilesystem`, `LocalSandbox`, `TypeScriptLSP`. Pipeline: setup → write file → spawn `tsc --noEmit` → parse diagnostics → enrich via LSP hover. **Model tier: none** (`tsc` + LSP produce the output; deterministic shape scorer asserts schema).

**Acceptance criteria:**
- [ ] `Workspace` constructed once in barrel-side helper
- [ ] Pipeline executes against an input `{filename, content}`
- [ ] Output `{ok, diagnostics: [...]}` with structured diagnostics
- [ ] LSP hover information attached when LSP is enabled
- [ ] Wired into `allWorkflows` barrel

**Verification:**
- [ ] Unit test: 2 inputs (clean snippet → `ok: true`; broken snippet → diagnostics with line/col)
- [ ] **Studio verification (per protocol — workflow variant):**
  - [ ] Discoverable: appears in Studio's Workflows tab; sandbox dataset (clean + broken) registered + visible in Experiments tab
  - [ ] Runnable: submit broken snippet from Studio → see structured diagnostics in output panel
  - [ ] Traced: Traces tab shows setup → write → spawn(`tsc`) → parse → LSP-hover spans
  - [ ] Scored: deterministic scorer (e.g. `diagnostics-shape`) wired per-run; Evals/Experiments shows scorer rows

**Dependencies:** None (workspace primitives ship in `@mastra/core/workspace`; already pinned at 1.27.0 — see R1)
**Files likely touched:**
- `packages/mastra/src/workflows/sandbox/workflow.ts` (new)
- `packages/mastra/src/workflows/sandbox/workspace.ts` (new — workspace factory)
- `packages/mastra/src/workflows/sandbox/index.ts` (new)
- `packages/mastra/src/workflows/sandbox/workflow.test.ts` (new)
- `packages/mastra/src/workflows/sandbox/workflow.eval.test.ts` (new)
- `packages/mastra/src/workflows/index.ts`
**Estimated scope:** Medium (6 files)

---

#### Task 4.5: Expose `sandbox-workflow` via MCPServer

**Description:** Register an `MCPServer` (stdio) that exposes the sandbox workflow as `typecheck_ts` tool. Wire into the same `Mastra` instance via `mcpServers` config (visible in Studio's MCP tab if available; otherwise validated by spawning a test client). **Coordinates with Task 0.4** — both edit `apps/studio/src/mastra/index.ts` (different keys: `experiments` from 0.4, `mcpServers` here). If 0.4 already shipped, simply add the `mcpServers` key alongside it; if branched in parallel, expect a merge conflict in the same file.

**Acceptance criteria:**
- [ ] `MCPServer` instance constructed with `workflows: { typecheck_ts: sandboxWorkflow }`
- [ ] Registered in `Mastra` via `mcpServers` config
- [ ] External MCP client (test harness) can `tools/call` `typecheck_ts` and receive structured diagnostics
- [ ] Stretch: `mcp-agent`'s `MCPClient` can also resolve `typecheck_ts` (closes the loop)

**Verification:**
- [ ] Unit test: spawn an in-process `MCPClient` against the server, call the tool, verify result
- [ ] Manual: connect Claude Desktop / `mcp-agent` and invoke `typecheck_ts`

**Dependencies:** Task 4.4
**Files likely touched:**
- `packages/mastra/src/mcp/sandbox-server.ts` (new)
- `packages/mastra/src/mcp/sandbox-server.test.ts` (new)
- `apps/studio/src/mastra/index.ts` (register `mcpServers`)
**Estimated scope:** Small (3 files)

---

### Checkpoint: Workflows
- [ ] `bun run ci` passes
- [ ] All 3 workflows Studio-green per protocol (workflow variant — per-step scorers, not constructor)
- [ ] Suspend/resume + time-travel verified manually in Studio Traces tab
- [ ] All 3 workflow datasets runnable from Studio's Experiments tab with scorer output
- [ ] MCPServer round-trip verified (external client can call `typecheck_ts`)
- [ ] Coverage matrix from spec is fully green
- [ ] Human review

---

### Phase 5 — Capability export + apps wiring

Each piece becomes a `CapabilityDefinition` matching the existing `simple-chat`/`deep-research` template. Wrapping is mechanical at this point — APIs are stable.

#### Task 5.1: Wrap pieces 1–3 as CapabilityDefinitions

**Description:** Create `capabilities/{echo,memory,guardrail}-agent/` folders each with `capability.ts` + `input.ts` + `settings.ts` + `capability.test.ts`, mirroring `capabilities/simple-chat/`.

**Acceptance criteria:**
- [ ] Three capability folders exist with the canonical 4-file layout
- [ ] Each `capability.ts` exports a `CapabilityDefinition`
- [ ] Each `settings.ts` declares a Zod settings schema that includes a `model: ChatTier` field (Zod enum of the wired chat tiers); the runner passes it to `getChatModel(model)` at run time, not at construction
- [ ] Each capability defaults the `model` setting to the tier listed in the per-piece assignment table
- [ ] Each capability test passes (matches `capabilities/simple-chat/capability.test.ts` pattern)

**Verification:**
- [ ] `bun test packages/mastra/src/capabilities/{echo,memory,guardrail}-agent/`
- [ ] Typecheck + build pass

**Dependencies:** Tasks 1.1, 1.2, 1.3
**Files likely touched:**
- 12 files (3 capabilities × 4 files)
**Estimated scope:** Medium (12 files; mechanical)

---

#### Task 5.2: Wrap pieces 4–7 as CapabilityDefinitions

**Description:** Same wrapping for `rag-agent`, `graph-rag-agent`, `mcp-agent`, `supervisor-agent`. Settings schemas include `model: ChatTier` like Task 5.1; `mcp-agent` additionally exposes the `tier` field of `requestContext` so callers can choose `free` vs `pro` per request.

**Acceptance criteria:**
- [ ] Four capability folders exist; tests pass
- [ ] Each `settings.ts` includes `model: ChatTier` defaulted to the per-piece table value
- [ ] `mcp-agent` capability surfaces `requestContext.tier` (`free` | `pro`) as a settings or input field
- [ ] `supervisor-agent` capability injects subagent capabilities (or accepts pre-built supervisor instance — match existing DI pattern)

**Verification:**
- [ ] `bun test packages/mastra/src/capabilities/{rag,graph-rag,mcp,supervisor}-agent/`
- [ ] Typecheck + build pass

**Dependencies:** Tasks 2.2, 2.3, 3.3, 3.4
**Files likely touched:**
- 16 files (4 capabilities × 4 files)
**Estimated scope:** Medium (16 files; mechanical)

---

#### Task 5.3: Wrap workflow pieces 8–10 as CapabilityDefinitions

**Description:** Same wrapping for `control-flow-workflow`, `hitl-workflow`, `sandbox-workflow`. Use the existing `capabilities/adapters/workflow-adapter.ts` pattern.

**Acceptance criteria:**
- [ ] Three workflow capabilities exist; tests pass
- [ ] `hitl-workflow` settings include `model: ChatTier` (defaulted to `default`); workflows with `chat tier: none` (control-flow, sandbox) **omit** the `model` field entirely — the schema reflects whether a piece needs a model at all
- [ ] HITL capability surfaces suspend payload via the existing `/runs/:id/approve` mechanism

**Verification:**
- [ ] `bun test packages/mastra/src/capabilities/{control-flow,hitl,sandbox}-workflow/`
- [ ] Typecheck + build pass

**Dependencies:** Tasks 4.1, 4.3, 4.4
**Files likely touched:**
- 12 files (3 capabilities × 4 files)
**Estimated scope:** Medium (12 files)

---

#### Task 5.4: Register capabilities in `apps/api`

**Description:** Update `apps/api/src/compose.ts` to register all 10 new capabilities alongside the existing `simple-chat` + `deep-research`. Verify each appears in `GET /capabilities`.

**Acceptance criteria:**
- [ ] All 10 capabilities listed in `GET /capabilities` JSON
- [ ] Each capability has correct id, version, schemas
- [ ] `POST /runs` works for each capability (smoke test 3 representative ones)
- [ ] No breaking changes to existing endpoints

**Verification:**
- [ ] `bun test apps/api`
- [ ] Manual: `bun run api` → `curl localhost:3000/capabilities | jq '.[].id'` shows all 12 ids
- [ ] `bun run ci`

**Dependencies:** Tasks 5.1, 5.2, 5.3
**Files likely touched:**
- `apps/api/src/compose.ts`
- `apps/api/src/compose.test.ts` (or equivalent integration test)
**Estimated scope:** Small (2 files)

---

#### Task 5.5: Register curated subset in `apps/cli`

**Description:** Update `apps/cli/src/compose.ts` to register the curated subset: `echoAgent`, `ragAgent`, `controlFlowWorkflow`. Keeps CLI demo focused; full list lives in `apps/api`.

**Acceptance criteria:**
- [ ] `apps/cli` registers exactly 3 capabilities (plus existing `simple-chat`)
- [ ] `apps/cli/src/compose.ts` migrates from direct `MASTRA_MODEL` env reads to `getChatModel(tier)` (tier read from CLI args or capability settings)
- [ ] CLI runs each successfully against an in-memory store
- [ ] Stdout JSON-lines match expected schema

**Verification:**
- [ ] `bun test apps/cli`
- [ ] Manual: `bun run --filter @harness/example-cli start <capability> <input>` for each of the 3
- [ ] `bun run ci`

**Dependencies:** Tasks 5.1, 5.2, 5.3
**Files likely touched:**
- `apps/cli/src/compose.ts`
- `apps/cli/src/compose.test.ts`
**Estimated scope:** Small (2 files)

---

### Checkpoint: Complete
- [ ] `bun run ci` passes
- [ ] `apps/api` exposes all 12 capabilities (10 new + 2 existing)
- [ ] `apps/cli` runs the curated subset
- [ ] Studio shows all 8 agents + 4 workflows (10 new + 2 existing)
- [ ] **Coverage matrix audit**: every row of the spec doc's coverage matrix has a corresponding piece in this plan; spec doc updated to mark each row `done`. Audit is a literal walkthrough — open `docs/mastra-feature-gallery-plan.md`, tick each row, commit.
- [ ] Final human review for merge

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Ollama `qwen2.5:0.5b` (tiny tier) produces unreliable structured output for `echo-agent` / `guardrail-agent` | High — derails Phase 1 | Per-tier env overrides (`MASTRA_MODEL_TINY`, `MASTRA_MODEL`, `MASTRA_MODEL_STRONG`) let you bump up without rewiring the factory. Eval tests use `errorStrategy: 'warn'` initially; can swap to `'fallback'` if extraction fails. If `tiny` tier is consistently flaky, promote affected pieces to `chat:default` in the per-piece table — central change, no factory rewrites. |
| Cloud-tier (`cloud:strong`) leaks into local-only test runs | Medium — CI hits Anthropic, eats budget | `getChatModel('cloud:strong')` throws when `ANTHROPIC_API_KEY` unset (Task 0.3). `mcp-agent` is the only piece that wires it, gated on `requestContext.tier === 'pro'` — never default. Eval tests use `default` / `judge` only. |
| `nomic-embed-text` quality on graph-rag relationship extraction is poor | Medium — graph queries return noisy results | Accepted per `Q9` answer (Ollama default); `MASTRA_EMBEDDER` override to OpenAI for verification. Eval test asserts top-1 not top-N. |
| `LocalSandbox` runs `tsc` on host; output paths could collide between runs | Low — flaky tests | `LocalFilesystem` root is per-run `tmpdir()`; tests clean up. |
| `MCPServer` registration changes Studio's startup behavior | Medium — Studio breakage halts iteration | Phase 4.5 lands last; if it breaks Studio, `mcpServers` config is gated behind an env flag. |
| Phase 5 capability wrapping reveals API churn from Phase 1–4 | Medium — rework | Capabilities deferred to Phase 5 by design; APIs settle first. |
| Stub MCPServer process leaks across test runs | Low — CI flake | Tests spawn + tear down per-test; `MCPClient` `dispose()` called in `afterEach`. |
| Working memory schema changes after Phase 1.2 force migrations | Low — dev-only DB | DB lives at `.mastra/mastra.db`; nuke and reseed if schema changes. Document `bun run rag:seed` + `graph-rag:seed` as the recovery path. |

## Resolved decisions (formerly open questions)

### R1. Workspace primitives ship in `@mastra/core` — no new dep needed
`LocalSandbox`, `LocalFilesystem`, `Workspace`, and `WORKSPACE_TOOLS` import from `@mastra/core/workspace`. Added in `@mastra/core@1.1.0`; we're pinned at `1.27.0`. TypeScript LSP is enabled with the simple flag `lsp: true` on the workspace config — no `typescript-language-server` install or custom server registration required for TS (custom LSPs are only needed for PHP/Ruby/Java/Kotlin/Swift/Elixir).

**Implication for Task 4.4**: imports become
```ts
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
const workspace = new Workspace({
  filesystem: new LocalFilesystem({ root: tmpdir() }),
  sandbox:    new LocalSandbox({ requireApproval: false }),
  lsp:        true,                               // built-in TS LSP
});
```
No `package.json` changes required for the workspace surface.

### R2. `MCPServer` ships in `@mastra/mcp` — add as a new dep
Constructor lives in `@mastra/mcp` (separate from core). `MCPClient` ships in the same package, so adding it covers both Tasks 3.1/3.2 (mcp-agent) and Task 4.5 (sandbox-workflow exposure). Registration is via `new Mastra({ mcpServers: { key: serverInstance } })`. Each workflow registered on the server becomes a tool named `run_<workflowKey>`. **Workflows must have a non-empty `description` or `MCPServer` initialization throws.**

**Implication for Task 4.5**:
```ts
import { MCPServer } from '@mastra/mcp';
const sandboxMcpServer = new MCPServer({
  id:      'harness-sandbox',
  name:    'harness-sandbox',
  version: '0.1.0',
  workflows: { typecheckTs: sandboxWorkflow },   // → tool named `run_typecheckTs`
});
// Registered in apps/studio/src/mastra/index.ts:
new Mastra({ /* … */ mcpServers: { sandbox: sandboxMcpServer } });
```

Covered by Task 0.0 (add `@mastra/mcp` dep, pin compatible with `@mastra/core@1.27.0`).

### R3. Register all 10 capabilities unconditionally in `apps/api` — no env gate
The starter's purpose is to demo the gallery; gating capabilities behind `HARNESS_GALLERY=1` would hide them from the people the starter exists for. Anyone deploying this code into production forks `apps/api/src/compose.ts` and edits the registration list — that's the clone-and-own invariant in CLAUDE.md (line 9). An env flag would add config surface for zero benefit.

**Implication for Task 5.4**: `apps/api/src/compose.ts` registers all 12 capabilities (10 new + `simple-chat` + `deep-research`) directly. No env reads.

### R4. Seed scripts probe-and-fail-loudly on dimension mismatch
`nomic-embed-text` is 768-dim; `nomic-embed-text-v2-moe` supports 256–768 (Matryoshka). Other Ollama embed models are different dimensions entirely. Silent dim mismatch produces unsearchable indexes that *appear* to work — worst-of-both-worlds.

**Implication for Tasks 2.1 + 2.3** (`seed.ts` shape):
```ts
const expectedDim = await probeDimension(embedder);   // embed a known string, count
const existing    = await vector.describeIndex(indexName).catch(() => null);
if (existing && existing.dimension !== expectedDim) {
  throw new Error(
    `Index "${indexName}" has dimension ${existing.dimension}, but the configured ` +
    `embedder produces ${expectedDim}. Drop the index (rm .mastra/mastra.db) and re-seed.`
  );
}
if (!existing) {
  await vector.createIndex({ indexName, dimension: expectedDim });
}
// …continue with chunk/embed/upsert
```
Probe runs once at the start of seeding (one extra embedding call per run). Loud failure means a developer sees the actual problem, not a mysterious "results are empty" bug downstream.

## Parallelization opportunities

Most of the plan is sequential due to template propagation (each piece copies its predecessor's structure). But these clusters are safe to parallelize across agents/sessions if needed:

- **Within Phase 1**: Tasks 1.1 / 1.2 / 1.3 are independent once the template from 1.1 is locked. Could be split.
- **Within Phase 2**: Task 2.3 is independent of Task 2.2 once Task 2.1 lands (both consume the vector helper).
- **Within Phase 4**: Tasks 4.1 / 4.3 / 4.4 are fully independent.
- **Within Phase 5**: Tasks 5.1 / 5.2 / 5.3 are independent (all consume the per-piece factories).

**Must be sequential**: 0.1 → 0.2 (memory needs storage); 0.3 (models) before every Phase 1–4 piece (locks the tier contract); 0.4 (datasets) before any task that ships a dataset (2.2, 2.3, 3.4, 4.1, 4.3, 4.4); 2.1 → 2.2; 3.1 → 3.2 → 3.3; 3.4 (after all its subagents); 4.1 → 4.2; 4.4 → 4.5; 5.4/5.5 (after all of 5.1–5.3).
