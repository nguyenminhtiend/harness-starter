# Spec — `apps/deep-research` (Deep-Research CLI)

**Status:** DRAFT — awaiting confirmation
**Date:** 2026-04-19
**Owner:** Tien Nguyen

> Companion app to `apps/cli-chat`. Where `cli-chat` is the "hello world" demo, `deep-research` is the first app that exercises **every** harness package and every composition primitive, while being a tool the author actually uses after building it.

---

## 1. Objective

Build a local-first, forkable **Deep-Research CLI** — `deep-research "<question>"` produces a well-cited markdown report by orchestrating a planner, N parallel researcher subagents, a writer, and a fact-checker.

### Why this app
- **Exercises the full harness surface.** Every package (`core`, `agent`, `tools`, `mcp`, `memory-sqlite`, `observability`, `eval`, `cli`) is touched by the happy path. Every composition primitive (`subagentAsTool`, `handoff`, `graph`) is used.
- **Usable post-build.** A local Perplexity-style tool the author will run weekly. Not yet-another-coding-assistant.
- **Clone-and-own demo.** Anyone cloning the starter can fork `apps/deep-research` into their own domain (market research, legal summarisation, scientific lit review, etc.) by swapping tools and prompts — the skeleton stays.

### Target users (in priority order)
1. **The author**, running `deep-research` weekly for real questions. This is the load-bearing user — if it is not useful to them on day one, the spec has failed.
2. **Forkers of `harness-starter`** — want a concrete reference that connects every primitive end-to-end.
3. **Reviewers / future contributors** — use the app as a reading path into the harness.

### Non-users (out of scope)
- Non-technical end users — CLI-only, no web UI, no installer.
- Multi-tenant / hosted service — single local user, no auth.
- Paid-SaaS replacement — does not chase feature-parity with Perplexity Pro / OpenAI Deep Research.

---

## 2. Design decisions (load-bearing)

| # | Decision | Rationale | Reversible? |
|---|---|---|---|
| D1 | **Graph DSL** drives the top-level flow (plan → research → write → verify → loop). | Exercises `graph` + `interrupt()`; the pipeline is genuinely a state machine with a HITL break. | Yes — could collapse to a hand-rolled loop. |
| D2 | **Researchers are `subagentAsTool`**, invoked in parallel by the planner. | Each subagent gets an isolated conversation + fresh budget carve-out; events stream up namespaced. | Yes — could fall back to a tool that directly calls `fetch`. |
| D3 | **Writer and fact-checker are `handoff` targets**, not subagents. | Handoff shares state and budget — we *want* the writer to see everything researchers gathered. | Yes — could make them subagents and pass context explicitly. |
| D4 | **Storage: `sqliteStore` + `sqliteCheckpointer`** by default; `inMemoryStore` behind `--ephemeral`. | Reports and past questions accumulate; resumable after HITL interrupt. | Yes — swap via flag. |
| D5 | **HITL gate after the planner proposes the research plan**, before any fetch is made. | Stops runaway spend; surfaces the plan so the user can redirect. Exactly the use case `interrupt()` was built for. | Yes — can bypass with `--no-approval`. |
| D6 | **Search: Brave Search MCP + `fetchTool` (allowlisted) fallback.** Configurable via env. | Brave has a free tier + is MCP-native (demos `@harness/mcp`); `fetchTool` alone (no MCP) is the zero-key fallback for CI/tests. | Yes — swap MCP server. |
| D7 | **Output = markdown file under `./reports/<slug>-<ts>.md` + live stdout stream.** | File is the artefact the user keeps; stdout is the feedback during the run. | Yes — `--no-file`, `--stdout-only`. |
| D8 | **One-shot by default** (`deep-research "Q"` → report → exit). **REPL is stretch**, behind `--repl`. | Simpler MVP; REPL can reuse the existing `cli-chat` readline patterns. | Yes. |
| D9 | **Observability:** `consoleSink` always, `jsonlSink` always (`./reports/<slug>-<ts>.events.jsonl`), Langfuse opt-in via env, OTel opt-in via env. | Console is UX; JSONL is free replay + eval fodder; Langfuse/OTel are demos. | Yes. |
| D10 | **Evals ship with the app.** `apps/deep-research/evals/*.eval.ts` runnable via `harness-eval` from `@harness/cli`. Live-provider evals gated behind `HARNESS_LIVE=1`. | Wires `@harness/eval` + `@harness/cli` into the happy path; catches regressions on fork. | Yes. |
| D11 | **Shared CLI UX primitives (spinner, renderer glue) live in this app**, not a new package. | Follows CLAUDE.md "three similar lines beats a premature abstraction." Spinner is ~30 lines. Extract only when a third app needs it. | Yes — extract to `apps/_shared/` or `@harness/tui` later. |
| D12 | **Guardrails:** one output hook that flags citations with no supporting fetch result. No input hook in v1. | Factuality is the one guardrail the domain actually needs; input filtering is busywork for a local single-user CLI. | Yes. |
| D13 | **Budget default:** `$0.50` and `200_000` tokens per report, overridable by flag + env. Planner gets 10%, researchers share 60%, writer 20%, fact-checker 10%. | Concrete defaults prevent "why did this cost $8" surprises on the first run. | Yes. |

---

## 3. Repo layout

```
apps/deep-research/
├── package.json              # depends on all harness packages (see §4)
├── tsconfig.json             # extends tsconfig.base.json
├── README.md                 # first-run + flags + env
├── src/
│   ├── index.ts              # CLI entrypoint — arg parsing, app wiring, exit codes
│   ├── config.ts             # envConfig() schema (OPENROUTER_API_KEY, BRAVE_API_KEY, budgets, paths)
│   ├── provider.ts           # aiSdkProvider (OpenRouter default, Ollama swap documented)
│   ├── agents/
│   │   ├── planner.ts        # createAgent — emits ResearchPlan (structured via Zod)
│   │   ├── researcher.ts     # createAgent — wrapped via subagentAsTool
│   │   ├── writer.ts         # createAgent — handoff target
│   │   └── fact-checker.ts   # createAgent — handoff target
│   ├── graph.ts              # graph({ nodes, edges, checkpointer }) — the state machine
│   ├── tools/
│   │   ├── search.ts         # fetchTool wrapper (allowlist) + MCP fallback logic
│   │   └── mcp.ts            # mcpTools(bravesearch) wiring (optional)
│   ├── guardrails/
│   │   └── citation-check.ts # OutputHook — fails if a cite URL never appeared in fetch results
│   ├── schemas/
│   │   ├── plan.ts           # Zod schemas (ResearchPlan, Subquestion, Finding, Report)
│   │   └── report.ts
│   ├── ui/
│   │   ├── spinner.ts        # copy of cli-chat spinner
│   │   ├── render.ts         # createStreamRenderer wiring (tool starts/results, compaction, handoffs)
│   │   └── approval.ts       # readline-based y/n for HITL interrupts
│   └── report/
│       ├── slug.ts           # question → filename slug
│       └── write.ts          # render Report (schema) → markdown on disk
├── reports/                  # .gitignored — report output
├── evals/
│   ├── fixtures/
│   │   └── questions.jsonl   # known questions + expected citation domains
│   ├── factuality.eval.ts    # llmJudge scorer
│   └── citation.eval.ts      # exact-match / includes on fetched URLs
└── tests/
    ├── graph.test.ts         # graph transitions with fakeProvider
    ├── guardrails.test.ts
    ├── report-writer.test.ts
    └── integration.test.ts   # end-to-end with fakeProvider — no network
```

**`reports/` is `.gitignore`d.** Evals fixtures and tests are committed.

---

## 4. Dependency map

| Harness package | Used for |
|---|---|
| `@harness/core` | `aiSdkProvider`, `createEventBus`, `envConfig`, `defineConfig`, budgets primitives via retry/cost |
| `@harness/agent` | `createAgent`, `tool`, `subagentAsTool`, `handoff`, `graph`, `interrupt`, `inMemoryStore`, `createStreamRenderer`, guardrails |
| `@harness/tools` | `fetchTool` (allowlisted) |
| `@harness/mcp` | `mcpTools` — Brave Search MCP |
| `@harness/memory-sqlite` | `sqliteStore`, `sqliteCheckpointer` |
| `@harness/observability` | `consoleSink`, `jsonlSink`, optional `langfuseAdapter`, optional `otelAdapter` |
| `@harness/eval` | `createScorer`, `evalite` |
| `@harness/cli` | `harness-eval` run entry (via `bun run eval`) |

**Every implemented package is imported by the happy path.** Cliam checked.

**Third-party:**
- `@openrouter/ai-sdk-provider` (already in use)
- `picocolors` (already in use)
- `zod` (already in use)
- `@modelcontextprotocol/sdk` via `@harness/mcp`

No new direct dependencies unless the MCP server needs one.

---

## 5. Data flow — the graph

```
           ┌─────────────┐
           │  PLANNER    │  LLM → ResearchPlan (Zod-validated)
           └──────┬──────┘
                  │
            ┌─────▼──────┐
            │ APPROVE?   │  ← interrupt() — HITL gate (skippable via --no-approval)
            └─────┬──────┘
         approved │  rejected → refine / exit
                  │
          ┌───────▼────────┐
          │   RESEARCH     │  planner invokes N parallel researcher subagents
          │  (subagents)   │   via subagentAsTool — one per subquestion
          └───────┬────────┘
                  │  all findings aggregated into RunState.findings
          ┌───────▼────────┐
          │    WRITER      │  handoff(writer) — drafts report from findings
          └───────┬────────┘
                  │
          ┌───────▼────────┐
          │  FACT-CHECKER  │  handoff(factChecker) — verifies each citation
          └───────┬────────┘
           pass   │   fail
                  │     └──► loop back to WRITER (up to 2 retries)
          ┌───────▼────────┐
          │    FINALIZE    │  write markdown, emit report.completed
          └────────────────┘
```

**Budget carve-up** (D13): planner 10% / researchers 60% (split equally) / writer 20% / fact-checker 10%. Each sub-agent aborts on its own budget exhaustion; parent may continue with whatever was gathered.

**Compaction:** automatic via `summarizingCompactor()` on the writer (which sees all findings).

**Retry:** inherited from provider-level `withRetry` in `@harness/core`.

---

## 6. Commands

### `deep-research "<question>"` — happy path

```bash
deep-research "What are the tradeoffs between CRDTs and OT for collaborative editing in 2026?"
```

Flags:

| Flag | Default | Purpose |
|---|---|---|
| `--depth <shallow|medium|deep>` | `medium` | Controls # subquestions (3 / 5 / 8). |
| `--out <dir>` | `./reports` | Output directory for markdown + jsonl. |
| `--no-file` | false | Stdout only. |
| `--no-approval` | false | Skip HITL plan approval. |
| `--ephemeral` | false | `inMemoryStore` instead of sqlite. |
| `--budget-usd <n>` | `0.50` | Hard $ ceiling. |
| `--budget-tokens <n>` | `200_000` | Hard token ceiling. |
| `--model <id>` | `config.MODEL_ID` | Override the OpenRouter model. |
| `--resume <runId>` | — | Resume a checkpointed run. |
| `--repl` | false | (stretch) enter REPL after report for follow-ups. |

Exit codes: `0` success, `1` budget exceeded, `2` user-aborted plan, `3` fact-check failed after retries, `130` SIGINT.

### `bun run eval`

From repo root, runs the eval suite under `apps/deep-research/evals/**/*.eval.ts` via `@harness/cli`'s `harness-eval`. Gated behind `HARNESS_LIVE=1` for calls that hit a real provider.

---

## 7. Code style

Inherits repo conventions from `CLAUDE.md`. App-specific:

- **No classes.** Agents/tools/hooks are plain objects, matching harness invariants.
- **Zod everywhere at boundaries.** `ResearchPlan`, `Subquestion`, `Finding`, `Report` all Zod; the planner uses `responseFormat` + structured-stream.
- **All file I/O goes through `report/write.ts`.** No ad-hoc `fs.writeFile` scattered across agents.
- **All colour via `picocolors`.** No raw ANSI codes, no `chalk`.
- **Comments are rare.** Only when WHY is non-obvious (matches CLAUDE.md §Default to writing no comments).
- **Biome is law.** `bun run lint` must pass before commit.
- **`envConfig()` is the only env reader.** Never `process.env.X` in the app.

---

## 8. Testing strategy

**Policy:** the harness rule is TDD for `packages/*` and pragmatic for `apps/*`. For this app:

- **Unit — TDD.** Graph transitions, guardrails, report writer, slug derivation. All against `fakeProvider()`. No network.
- **Integration — tests-after is fine.** End-to-end run with `fakeProvider()` scripting: plan → research (1 subagent) → write → fact-check → finalize. Asserts file written, events emitted, exit 0.
- **Evals — live, gated.** `*.eval.ts` under `apps/deep-research/evals/`. Excluded from `bun test` (per repo convention). Run via `HARNESS_LIVE=1 bun run eval`.
- **UI — manual.** Spinner, colour, streaming feel are tested by running the app against a live model. Call this out in the PR description; do not fake it.

**Coverage target:** every graph node and every guardrail has at least one test. No coverage % enforcement.

**What we do not test:**
- `createStreamRenderer` itself (already tested in `@harness/agent`).
- Provider internals (already tested in `@harness/core`).

---

## 9. UI/UX — reuses existing primitives

The app imports, rather than reimplements:

- **`createStreamRenderer`** from `@harness/agent` — the callback dispatcher. App provides callbacks for text/thinking/tool-start/tool-result/handoff/compaction/usage/abort/error. The handoff and tool-start callbacks make multi-agent progress legible.
- **`picocolors`** — `cyan` for prompts, `dim` for metadata, `red` for errors, `yellow` for budget warnings, `green` for "approved" / "done".
- **`spinner.ts`** — copied verbatim from `cli-chat`. Shown between sub-phases (planning, researching, writing, verifying), not per-token.
- **Usage footer** — identical to `cli-chat` (`(<tokens> tokens · <duration>s · $<cost>)`), emitted after the report is finalised.
- **SIGINT handling** — first Ctrl+C aborts the current stream (graph can still checkpoint); second Ctrl+C exits.
- **Readline** — only used for (a) HITL approval prompt (`approve plan? [y/N/edit]`), (b) the stretch REPL.

Rendering contract per phase:
```
📋 planning…                                                      ⠋
   → 5 subquestions                                               ✓ 1.2s

🔎 researching (5 parallel)                                       ⠙
   ├─ q1: "…"                                                     ✓ 3 sources
   ├─ q2: "…"                                                     ✓ 4 sources
   …
✍️  writing…                                                      ⠸
🔍 fact-checking…                                                 ⠼
   ⚠ citation [3] not found in fetched pages — retrying writer
✅ report saved → reports/crdt-vs-ot-20260419-1430.md
   (42_318 tokens · 28.4s · $0.14)
```

Emojis in the UI are **intentional** (user-facing polish), not in code/docs/comments.

---

## 10. Boundaries

### Always
- **Run `bun run ci` before declaring a change done.**
- **Gate all live-provider calls behind `HARNESS_LIVE=1`** in tests/evals.
- **Validate every LLM-structured output with Zod** before acting on it.
- **Write the report file atomically** (write-tmp-then-rename) so interrupted runs never leave half-written reports.
- **Emit a `jsonl` event log alongside every report** — same slug, `.events.jsonl`. This is the ground-truth for replay + evals.
- **Respect the budget** — the app exits non-zero rather than prompting to continue.
- **Use `sqliteStore` + `sqliteCheckpointer` by default.** The user gets a resumable, searchable history for free.

### Ask first
- Adding a new third-party dependency.
- Changing the graph topology (§5).
- Changing the default budget values (D13).
- Introducing a web UI, server mode, or auth.
- Extracting shared CLI UX into a new package (D11 promotion).
- Adding a new MCP server to the default wiring.

### Never
- **Never write to the filesystem outside `--out` or the sqlite DB.** The fact-checker does not write, the researchers do not write — only the finalizer does.
- **Never call `process.env.X` directly.** Always via `config`.
- **Never `try/catch` around the graph that swallows `InterruptSignal` / `HandoffSignal` / `AbortError`** — these must propagate.
- **Never mock `Provider` in tests** — `fakeProvider()` only (CLAUDE.md §Testing).
- **Never cross-package-import in violation of the DAG** (`biome.json` will reject).
- **Never ship a feature that makes `apps/cli-chat` or any `packages/*` deletion break** — clone-and-own invariant.
- **Never bundle a classifier / vector DB / RAG primitive** — per CLAUDE.md non-goals.
- **Never put secrets in the report or the event log.** Guardrail output hook should redact before write.
- **Never block on human input without a checkpoint** — if the user walks away after a HITL prompt, the checkpoint must allow `--resume` to pick up.

---

## 11. Acceptance criteria

A reviewer can clone the repo fresh and verify:

1. `bun run ci` is green.
2. `echo "OPENROUTER_API_KEY=sk-…" > .env && cd apps/deep-research && bun run src/index.ts "What is CRDT?"` produces a markdown report in under 3 minutes.
3. The produced report has: a title, 3+ sections, every factual claim followed by `[n]` referencing a source in a References section, a References list whose URLs appear in the event log's `tool-result` events.
4. Running the same command with `--no-approval` skips the plan prompt.
5. Running with `--budget-usd 0.01` exits with code 1 and a readable `budget.exceeded` message after some work is done.
6. `HARNESS_LIVE=1 bun run eval --filter factuality` runs at least one `llmJudge` scorer against a live provider.
7. Killing the process mid-research with Ctrl+C, then re-running with `--resume <runId>`, produces a report that finishes from where it left off.
8. Deleting `packages/mcp/` and `packages/memory-sqlite/` still lets the app build — MCP and sqlite imports are optional (guarded by config).
9. The Langfuse trace (when `LANGFUSE_PUBLIC_KEY` is set) shows: one root trace, child spans for planner/researchers/writer/fact-checker, tool calls attached to researchers.
10. `apps/cli-chat` still works unchanged.

**Acceptance criteria 8** is load-bearing — the optional-MCP / optional-sqlite wiring is how we prove the clone-and-own invariant on this app.

---

## 12. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Graph DSL + subagent-as-tool + handoff all in one app is ambitious. Something will break on the first full run. | Build in the order of §5 (top-to-bottom). Ship plan→write→save before wiring research subagents. |
| Search MCP availability varies. | `fetchTool` allowlist fallback — works with zero external services. MCP is a demo, not a hard requirement. |
| Budget math is fiddly. | Start with a hard top-level cap; split across sub-agents only once the top-level cap works. |
| Fact-checker loop could spin forever. | Hard retry cap of 2 (D note in §5). After that, emit a warning and ship the report with unverified citations flagged. |
| Report quality is subjective. | Evals with `llmJudge` + URL citation exact-match give us *some* regression signal. Manual spot-check is still required. |
| User types Ctrl+C during HITL approval. | Treat as rejection; checkpoint the plan; exit 2. `--resume` picks it up. |

---

## 13. Non-goals for v1

- Web UI or TUI beyond streaming stdout.
- Multi-user / auth / rate limiting.
- Caching of fetched pages (each run re-fetches — predictable, simple).
- RAG / vector store (CLAUDE.md non-goal).
- Report editing UX (the user edits the markdown by hand).
- Push notifications / Slack output.
- Streaming the report to a file as it's written (write once at the end).
- Plugin system for new agent roles — forkers edit TypeScript.

---

## 14. Open questions (confirm before build)

1. **Search backend default** — confirm "Brave MCP + fetchTool fallback." If you don't want a paid-tier key, say so and I'll drop the MCP side to "documented but off by default" and lean on `fetchTool` + a list of public sources.
2. **Budget defaults** — `$0.50` / `200k tokens`. Adjust?
3. **Output path** — `./reports/<slug>-<ts>.md`. Adjust?
4. **Acceptance criterion 8** (clone-and-own for MCP/sqlite) — okay to make these runtime-optional via config, even if it costs a small amount of conditional wiring?
5. **REPL** — keep as stretch, or drop entirely for v1?

---

## 15. Implementation phasing (preview — detailed plan comes next)

1. **Scaffold** — package.json, tsconfig, empty entrypoint, `--help`.
2. **Minimum viable loop** — single-agent research + write (no graph, no subagents, no HITL). Verifies basic wiring end-to-end.
3. **Graph** — convert the loop to `graph()`; add `interrupt()` HITL gate.
4. **Subagents** — planner fans out N researchers via `subagentAsTool`.
5. **Handoff chain** — researchers → writer → fact-checker.
6. **Persistence** — `sqliteStore` + `sqliteCheckpointer`, `--resume`.
7. **Guardrails + budgets** — citation-check output hook; budget flags.
8. **Observability** — jsonl sink always; Langfuse / OTel env-gated.
9. **Evals** — factuality + citation scorers under `evals/`.
10. **Polish** — spinner wiring, usage footer, colour, README.
11. **Optional** — REPL, Ollama example in `.env.example`.

Each phase has its own detailed plan (written via the `/plan` skill, one at a time, per repo convention).

---

**End of spec.** Pending sign-off on §14.
