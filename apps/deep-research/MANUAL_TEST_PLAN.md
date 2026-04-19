# Deep Research — Manual Test Plan & Code Walkthrough

## Table of Contents

- [Part 1: Prerequisites](#part-1-prerequisites)
- [Part 2: Manual Test Plan](#part-2-manual-test-plan)
- [Part 3: Code Walkthrough](#part-3-code-walkthrough)

---

## Part 1: Prerequisites

### Environment Variables

| Variable | Required | How to get |
|----------|----------|------------|
| `OPENROUTER_API_KEY` | **yes** | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `BRAVE_API_KEY` | no | [brave.com/search/api](https://brave.com/search/api/) — enables web search MCP tool |
| `MODEL_ID` | no | Defaults to `openrouter/auto`. Try `google/gemini-2.0-flash-001` for cheap tests |

### Install

```bash
cd /path/to/harness-starter
bun install
```

### Verify Build

```bash
bun run ci  # must pass: lint + typecheck + build + test
```

---

## Part 2: Manual Test Plan

### Test 1: Help & Version (no API key needed)

**Goal:** Verify CLI arg parsing works.

```bash
bun run research -- --help
bun run research -- --version
```

**Expected:**
- `--help` prints usage text with flags table, exits 0
- `--version` prints `0.0.0`, exits 0

---

### Test 2: Missing Question

**Goal:** Verify error when no question provided.

```bash
bun run research
```

**Expected:** Red error message "a question is required", exits 1.

---

### Test 3: Happy Path — Ephemeral + No Approval

**Goal:** Full pipeline end-to-end with minimum friction.

```bash
export OPENROUTER_API_KEY="sk-or-..."
bun run research -- "What are CRDTs?" --no-approval --ephemeral --depth shallow --budget-usd 0.30
```

**Expected output flow:**
1. `deep-research · "What are CRDTs?"` header
2. `📋 planning…` — planner generates 3 subquestions (shallow = 3)
3. `📋 plan created` — transitions to research phase
4. Tool calls appear: `├─ fetch…` with `✓ X.Xs` durations (N parallel researcher subagents)
5. `✍️ writing…` — writer composes report
6. `🔍 fact-checking…` — fact-checker verifies citations
7. `✅ report saved → ./reports/<slug>-<timestamp>.md`
8. Usage footer (tokens, duration)
9. Exit code 0

**Verify:**
- Open the generated `./reports/what-are-crdts-*.md`
- Should have a title, multiple `## Heading` sections, `[n]` inline citations, and a `## References` section with URLs
- Check `./reports/<slug>-*.events.jsonl` exists (observability log)

---

### Test 4: HITL Plan Approval (default mode)

**Goal:** Test the interrupt + approval flow.

```bash
bun run research -- "Explain the history of RISC-V" --ephemeral --depth shallow
```

**Expected:**
1. Planning phase runs
2. A **Research Plan** is printed showing subquestions + search queries
3. Prompt: `Approve plan? [y/n]`
4. Type `n` → "Plan rejected.", exit code 2
5. Run again, type `y` → research continues as normal

---

### Test 5: Budget Exceeded

**Goal:** Verify budget enforcement.

```bash
bun run research -- "Explain quantum computing" --no-approval --ephemeral --budget-tokens 500
```

**Expected:**
- Hits token budget quickly (500 tokens is tiny)
- `⚠ budget exceeded: tokens — spent X, limit 500`
- `[budget exceeded]` error message, exit code 1

Try dollar budget too:

```bash
bun run research -- "Explain quantum computing" --no-approval --ephemeral --budget-usd 0.001
```

---

### Test 6: Depth Levels

**Goal:** Verify planner generates different subquestion counts.

```bash
# 3 subquestions
bun run research -- "What is Rust?" --no-approval --ephemeral --depth shallow

# 5 subquestions (default)
bun run research -- "What is Rust?" --no-approval --ephemeral --depth medium

# 8 subquestions
bun run research -- "What is Rust?" --no-approval --ephemeral --depth deep --budget-usd 1.00 --budget-tokens 500000
```

**Expected:** The plan (visible in events or by removing `--no-approval`) should have 3, 5, or 8 subquestions respectively.

---

### Test 7: SQLite Persistence + Resume

**Goal:** Test checkpoint/resume across runs.

```bash
# Run 1: will pause at approval
bun run research -- "What is WebAssembly?" --depth shallow
# Note the checkpointed ID printed: (checkpointed: abcd1234)
# Type 'n' to reject the plan (exit 2)

# Run 2: resume that run
bun run research -- "What is WebAssembly?" --resume <full-run-id> --no-approval
```

**Expected:**
- Run 1 creates sqlite DB at `~/.deep-research/` (store.db + checkpoints.db)
- Run 2 loads the checkpoint and skips re-planning
- "Using sqlite storage" message appears

**Cleanup:**

```bash
rm -rf ~/.deep-research  # remove sqlite DBs
```

---

### Test 8: No-File Mode (stdout only)

**Goal:** Verify `--no-file` skips report and events file.

```bash
bun run research -- "What is Bun?" --no-approval --ephemeral --no-file --depth shallow
```

**Expected:**
- No files created in `./reports/`
- Output only goes to stdout

---

### Test 9: Custom Output Directory

**Goal:** Verify `--out` flag.

```bash
bun run research -- "What is Deno?" --no-approval --ephemeral --depth shallow --out ./test-reports
```

**Expected:** Report saved in `./test-reports/what-is-deno-*.md`.

```bash
rm -rf ./test-reports  # cleanup
```

---

### Test 10: Model Override

**Goal:** Verify `--model` flag.

```bash
bun run research -- "What is Zig?" --no-approval --ephemeral --depth shallow --model google/gemini-2.0-flash-001
```

**Expected:** Uses specified model. Verify in events.jsonl or by observing different response style/speed.

---

### Test 11: Brave Search MCP (optional)

**Goal:** Test with Brave Search enabled.

```bash
export BRAVE_API_KEY="BSA..."
bun run research -- "Latest developments in AI regulation 2025" --no-approval --ephemeral --depth shallow
```

**Expected:**
- Should see `brave_web_search` tool calls alongside `fetch` calls
- More relevant/current results since Brave provides real search

---

### Test 12: SIGINT Handling

**Goal:** Test graceful cancellation.

```bash
bun run research -- "Explain dark matter" --no-approval --ephemeral --depth medium
# Press Ctrl+C during research phase
```

**Expected:**
- First Ctrl+C aborts the current stream gracefully
- Second Ctrl+C forces exit
- `(cancelled)` message, exit code 130

---

### Test 13: Langfuse Tracing (optional)

**Goal:** Verify observability integration.

```bash
export LANGFUSE_PUBLIC_KEY="pk-..."
export LANGFUSE_SECRET_KEY="sk-..."
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"
bun run research -- "What is OAuth 2.0?" --no-approval --ephemeral --depth shallow
```

**Expected:** "Langfuse tracing enabled" printed. Traces visible in Langfuse dashboard.

---

### Test 14: Invalid Arguments

**Goal:** Test input validation.

```bash
bun run research -- "test" --budget-usd abc     # NaN check
bun run research -- "test" --budget-tokens abc   # NaN check
bun run research -- "test" --unknown-flag        # strict parsing
```

**Expected:** Each prints an error and exits non-zero.

---

### Test 15: Unit Tests

**Goal:** Confirm all colocated unit tests pass.

```bash
bun test apps/deep-research/
```

---

## Part 3: Code Walkthrough

Below is a file-by-file, bottom-up walkthrough of how the deep-research app works.

---

### Step 1: Configuration — `src/config.ts`

```
src/config.ts → Zod schema → envConfig() → typed config object
```

Uses `@harness/core`'s `envConfig` helper to parse `process.env` against a Zod schema. Every env var has a type + default. The result is a fully-typed `config` singleton used everywhere.

**Key fields:**
- `OPENROUTER_API_KEY` — required, no default
- `MODEL_ID` — defaults to `openrouter/auto`
- `BRAVE_API_KEY` — optional, unlocks Brave Search MCP
- `BUDGET_USD` / `BUDGET_TOKENS` — spending ceilings
- `REPORT_DIR` — where markdown reports go
- `DATA_DIR` — SQLite persistence directory

---

### Step 2: Provider — `src/provider.ts`

```
OpenRouter SDK → AI SDK model → aiSdkProvider() wrapper → Provider interface
```

Wraps `@openrouter/ai-sdk-provider` into the harness `Provider` interface. The `Provider` is the abstraction that all agents use to call LLMs — it has `.generate()` and `.stream()` methods.

The model ID can be overridden via `--model` CLI flag. Otherwise falls back to `config.MODEL_ID`.

---

### Step 3: Schemas — `src/schemas/plan.ts` & `src/schemas/report.ts`

**`plan.ts`** defines the planner's output shape:

```
ResearchPlan {
  question: string
  subquestions: Subquestion[] (min 1)
}

Subquestion {
  id: string        // e.g. "q1", "q2"
  question: string  // the focused subquestion
  searchQueries: string[]  // suggested search terms
}
```

**`report.ts`** defines the writer's output and researcher's finding:

```
Finding {
  subquestionId: string   // maps back to plan
  summary: string
  sourceUrls: string[]    // URLs actually fetched
}

Report {
  title: string
  sections: ReportSection[]   // { heading, body }
  references: Reference[]     // { url, title? }
}
```

These Zod schemas serve dual purpose: (1) validate LLM JSON output, (2) provide TypeScript types.

---

### Step 4: Budget Splitting — `src/budgets.ts`

The total budget (USD + tokens) is divided across 4 roles:

| Role | Ratio |
|------|-------|
| Planner | 10% |
| Researcher | 60% |
| Writer | 20% |
| Fact-checker | 10% |

`splitBudget({ usd: 0.50, tokens: 200000 })` returns:

```
planner:     { usd: 0.05,  tokens: 20000  }
researcher:  { usd: 0.30,  tokens: 120000 }
writer:      { usd: 0.10,  tokens: 40000  }
factChecker: { usd: 0.05,  tokens: 20000  }
```

Researchers get the lion's share because they do N parallel web fetches.

---

### Step 5: Tools — `src/tools/search.ts` & `src/tools/mcp.ts`

**`search.ts`** creates the tool array available to researcher subagents:

1. **`fetchTool`** (always present) — from `@harness/tools`, configured with `allow: [/^https:\/\//]` (HTTPS-only allowlist). This tool fetches web pages and returns their content.

2. **Brave Search MCP** (optional) — if `BRAVE_API_KEY` is set, `mcp.ts` dynamically imports `@harness/mcp` and connects to `@brave/brave-search-mcp-server` via stdio transport. This gives the agent a `brave_web_search` tool. Falls back gracefully to `[]` if the MCP package isn't installed.

---

### Step 6: Agents — `src/agents/`

Four agents, each with a focused system prompt and constrained output format:

#### 6a. Planner — `src/agents/planner.ts`

- **Not a full agent** — it's a `GraphNode` that calls `provider.generate()` directly
- Sends the question to the LLM with a system prompt asking for JSON
- Parses response with `parseModelJson()` (strips markdown fences, validates with Zod `ResearchPlan` schema)
- Has retry logic (up to 3 attempts) — if JSON parsing fails, it re-prompts with a "your previous response was not valid JSON" hint
- Depth controls how many subquestions: `shallow=3, medium=5, deep=8`

#### 6b. Researcher — `src/agents/researcher.ts`

- Uses `createAgent()` from `@harness/agent` — a full agentic loop with tool calling
- Wrapped as a **tool** via `subagentAsTool()` — this is how graph nodes can dispatch parallel subagent work
- System prompt tells it to use `fetch` to investigate a single subquestion
- `maxTurns: 15` — can make up to 15 tool calls per subquestion
- Returns a `Finding` JSON: `{ subquestionId, summary, sourceUrls }`

#### 6c. Writer — `src/agents/writer.ts`

- Full agent with `summarizingCompactor()` (auto-compacts long context)
- Receives all findings as text, synthesizes into a structured `Report` JSON
- `maxTurns: 3` — mostly just needs one turn to write
- System prompt enforces `[n]` inline citations mapping to a references array

#### 6d. Fact-checker — `src/agents/fact-checker.ts`

- Full agent, no tools (just LLM reasoning)
- Receives the report + source URLs from research
- Returns `{ pass: boolean, issues: string[] }`
- Strict mode: any unverifiable citation → `pass: false`

**Shared options** (`src/agents/types.ts`): All agents accept optional `memory`, `budgets`, and `events` via `BaseAgentOpts`.

---

### Step 7: Guardrails — `src/guardrails/citation-check.ts`

Two utilities:

1. **`extractUrls(text)`** — regex-based URL extraction from any text. Used in the graph to find URLs cited in the report.

2. **`citationCheckHook(fetchedUrls)`** — an `OutputHook` (not currently wired into the graph, but available as a library). Compares cited URLs against a set of fetched URLs and returns `{ action: 'block', reason }` if unfetched URLs are found.

The graph's `factCheckNode` does a lighter version of this inline: it extracts URLs from the report text, diffs them against research source URLs, and adds warnings to the fact-checker prompt.

---

### Step 8: Report Writing — `src/report/write.ts` & `src/report/slug.ts`

**`slug.ts`**: Converts the question into a filesystem-safe slug. `"What are CRDTs?"` → `what-are-crdts`. Truncated at 60 chars on a word boundary.

**`write.ts`**:
- `renderMarkdown(report)` — converts the `Report` object to markdown: title as `#`, sections as `##`, references as a numbered list
- `writeReport(report, outDir, slug)` — writes atomically: `mkdir -p outDir` → write to `.tmp` file → `rename()` to final path. This prevents half-written reports on crash/abort.

Output filename: `<slug>-<timestamp>.md`

---

### Step 9: JSON Parsing Helper — `src/lib/parse-json.ts`

Two utilities for handling LLM output:

1. **`parseModelJson(raw, schema)`** — LLMs often wrap JSON in markdown fences. This strips `` ```json ... ``` `` fences, then `JSON.parse`, then validates with the Zod schema.

2. **`messageTextContent(content)`** — extracts plain text from AI SDK's message content format (which can be either a string or an array of `{type, text}` parts).

---

### Step 10: UI Renderer — `src/ui/render.ts`

A `StreamRendererCallbacks` implementation that drives the CLI output during execution. It's a state machine with phases: `planning → researching → writing → fact-checking → done`.

**Callbacks:**
- `onTextDelta` — stops spinner on first token, optionally prints text in verbose mode
- `onToolStart` — prints `├─ toolName…` with tree-like formatting
- `onToolResult` — prints `│ ✓ Xs` (duration)
- `onHandoff` — detects phase transitions by matching node names (write/fact-check)
- `onCheckpoint` — prints checkpoint ID during planning
- `onBudgetExceeded` — yellow warning
- `onCompaction` — dim log of context compaction
- `onAbort` / `onError` / `onFinish` — stop spinner

Uses `picocolors` for terminal styling and a spinner from `@harness/tui`.

---

### Step 11: Persistence — `src/persistence.ts`

Creates either SQLite or in-memory storage:

1. **SQLite** (default): Dynamically imports `@harness/memory-sqlite`. Creates `~/.deep-research/store.db` (conversation memory) and `checkpoints.db` (graph state). Returns `close()` cleanup function.

2. **Memory** (with `--ephemeral`): Uses `inMemoryStore()` and `inMemoryCheckpointer()` from `@harness/agent`. Data is lost on exit.

If `@harness/memory-sqlite` isn't installed, falls back to memory silently.

---

### Step 12: The Graph — `src/graph.ts`

This is the **orchestration core**. Defines a directed acyclic graph of nodes:

```
plan → approve → research → write → fact-check → finalize
                                         ↑              |
                                         └── (retry) ───┘
```

**Nodes:**

| Node | What it does |
|------|-------------|
| `plan` | Calls planner to decompose question into subquestions |
| `approve` | HITL gate — calls `interrupt('plan-approval')` unless `--no-approval` or already approved |
| `research` | Creates N researcher subagent-tools, dispatches in **parallel** via `Promise.all()`. Each returns a `Finding` |
| `write` | Passes all findings to writer agent, gets a structured `Report` back |
| `fact-check` | Verifies citations, returns `{ pass, issues }` |
| `finalize` | Terminal no-op node |

**Dynamic edge** (fact-check → ?):
- If `factCheckPassed === true` → `finalize`
- If retries ≥ 2 → `finalize` (give up)
- Otherwise → `write` (retry the report)

**State** (`ResearchState`): The graph carries a single state object through all nodes:

```typescript
{
  userMessage: string      // original question
  plan?: ResearchPlan      // from planner
  approved?: boolean       // HITL gate
  findings?: Finding[]     // from N researchers
  report?: Report          // from writer
  reportText?: string      // raw text for fact-checker
  factCheckPassed?: boolean
  factCheckRetries?: number
}
```

Graph is created with `graph()` from `@harness/agent`, which returns an `Agent` — meaning you can call `.stream()` or `.run()` on the whole pipeline.

---

### Step 13: Entry Point — `src/index.ts`

The main CLI orchestrator. Here's the execution flow:

#### 13a. Parse CLI Args

Uses Node's `parseArgs` with strict mode. Extracts: `depth`, `out`, `no-file`, `no-approval`, `ephemeral`, `budget-usd`, `budget-tokens`, `model`, `resume`, `help`, `version`.

#### 13b. Validate & Configure

- Checks question is non-empty
- Parses budget numbers (NaN guard)
- Calls `splitBudget()` to divide budget across agents
- Creates the `Provider` via `createProvider(modelId)`
- Creates persistence (SQLite or memory)
- Generates or resumes `runId`

#### 13c. Setup Observability

- **Console sink** — set to `silent` (UI renderer handles display)
- **JSONL sink** — writes all events to `<slug>-<timestamp>.events.jsonl` (unless `--no-file`)
- **Langfuse adapter** — optional, dynamically imported

#### 13d. Create Tools & Graph

- `createSearchTools()` — fetchTool + optional Brave Search MCP
- `createResearchGraph()` — wires everything into the graph

#### 13e. Setup SIGINT Handler

- First Ctrl+C aborts the current stream (sets `streamAc.current = null`)
- Second Ctrl+C kills the process (exit 130)

#### 13f. Run Research Loop

`runResearchLoop()` is the core execution function:

1. **First stream call** — streams the graph. The planner runs, then `approve` node fires `interrupt()`.
2. **Interrupt pauses the stream** — control returns to the CLI.
3. **Display plan** — prints subquestions + search queries.
4. **Prompt approval** — `promptApproval('Approve plan?')`.
5. **If rejected** — exit 2.
6. **If approved** — saves `approved: true` to checkpoint, resets abort controller.
7. **Second stream call** — resumes graph from checkpoint. Research, write, fact-check run.

If `--no-approval` is set, the first stream call runs the entire pipeline without pausing.

#### 13g. Post-Run

- Reads the `Report` from the final checkpoint (or wraps raw text as a fallback)
- Calls `writeReport()` to save markdown atomically
- Prints usage footer (tokens, duration)
- Tears down sinks, closes persistence
- Exit 0

#### 13h. Error Handling

| Error | Exit |
|-------|------|
| `AbortError` (SIGINT) | 130 |
| `BudgetExceededError` | 1 |
| Any other | 1 |

---

### Data Flow Diagram

```
User types: "What are CRDTs?"
         │
         ▼
┌─────────────────┐
│  index.ts       │  parse args, create provider, tools, graph
│  (entry point)  │
└────────┬────────┘
         │ agent.stream({ userMessage: "What are CRDTs?" })
         ▼
┌─────────────────┐
│  plan node      │  provider.generate() → LLM returns JSON
│  (planner.ts)   │  → parse with Zod → ResearchPlan { subquestions: [...] }
└────────┬────────┘
         │ state.plan = plan
         ▼
┌─────────────────┐
│  approve node   │  interrupt('plan-approval') → stream pauses
│  (graph.ts)     │  → CLI shows plan, user types 'y'
└────────┬────────┘  → checkpoint saved with approved: true
         │           → stream resumes
         ▼
┌─────────────────┐
│  research node  │  for each subquestion (in parallel):
│  (graph.ts)     │    → createResearcherTool() → subagentAsTool()
│                 │    → agent calls fetchTool (HTTPS pages)
│                 │    → returns Finding { subquestionId, summary, sourceUrls }
└────────┬────────┘
         │ state.findings = [Finding, Finding, Finding]
         ▼
┌─────────────────┐
│  write node     │  createWriterAgent() → agent.run()
│  (graph.ts)     │  → LLM synthesizes findings into Report JSON
│                 │  → { title, sections: [...], references: [...] }
└────────┬────────┘
         │ state.report = report, state.reportText = raw
         ▼
┌─────────────────┐
│  fact-check     │  createFactCheckerAgent() → agent.run()
│  node           │  → compares cited URLs vs research source URLs
│  (graph.ts)     │  → returns { pass: true/false, issues: [...] }
└────────┬────────┘
         │
         ├── pass=true OR retries≥2 ──→ finalize → write report to disk
         │
         └── pass=false, retries<2 ──→ back to write node (retry)
```

---

### Key Design Patterns Used

| Pattern | Where | Why |
|---------|-------|-----|
| **Graph orchestration** | `graph.ts` | Defines a DAG of nodes with typed state — enables checkpointing, interrupts, conditional edges |
| **Subagent-as-tool** | `researcher.ts` | Wraps a full agent as a tool, so the research node can dispatch N subagents in parallel |
| **HITL interrupt** | `approve` node | Pauses the graph mid-execution, lets user review plan, then resumes from checkpoint |
| **Structured output + auto-repair** | `planner.ts` | LLM returns JSON, validated by Zod. On parse failure, retries with hint |
| **Budget splitting** | `budgets.ts` | Top-level budget divided by ratio so no single agent can blow the whole budget |
| **Atomic writes** | `report/write.ts` | Write to .tmp → rename prevents corrupt files |
| **Graceful degradation** | `persistence.ts`, `mcp.ts` | Optional deps imported dynamically with try/catch fallback |
| **Stream-first** | everywhere | Graph returns `AsyncIterable<AgentEvent>`, renderer consumes the stream |
| **Event bus** | observability setup | Decouples agent events from sinks (console, JSONL, Langfuse) |
