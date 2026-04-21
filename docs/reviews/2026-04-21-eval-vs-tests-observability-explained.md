# Eval & AI Observability vs. Traditional Tests & APM — A Detailed Explanation

_Date: 2026-04-21_

This doc is for engineers comfortable with traditional software (unit tests, APM, logs) who are moving into agentic AI systems. The punchline first:

> **Unit tests and APM assume determinism.** Agents are non-deterministic. The toolchain shifts from pass/fail assertions to *statistical quality measurement*, and from request/response tracing to *multi-turn reasoning tracing*. Eval and agent observability are the equivalents — same goals, different machinery.

---

## 1. What traditional tests & observability actually do

### Unit / integration / e2e tests

The whole stack rests on one assumption: **same input → same output**.

```ts
expect(add(2, 2)).toBe(4);        // hard assertion
expect(user.email).toMatch(/@/);  // hard regex
```

What they answer:
- Does this code produce the correct output? (yes/no)
- Did I break anything? (yes/no via CI gate)

They work because functions are deterministic. If `add(2, 2)` returns `5`, something is objectively broken and you can fix it before merge.

### APM / observability (Datadog, New Relic, OpenTelemetry on a REST API)

Traditional observability answers infrastructure questions:

- Is the service up? (healthcheck)
- How fast is p95 latency? (histogram metric)
- What errors are we throwing? (log search, exception tracker)
- Which DB query is slow? (trace flame graph)

A trace for a REST request looks like: `HTTP GET /users/:id → auth.verify → db.query → serialize → response`. Five spans. One user-visible action. Each span is mechanical: it either succeeded or it didn't, and if it was slow you look at wall-clock time.

---

## 2. Why this breaks for AI agents

An agent run is fundamentally different from a function call or an HTTP request. Here's why the tools don't port cleanly:

### 2.1 Outputs are non-deterministic

Ask an LLM "Capital of France?" three times, you get:
- "Paris"
- "The capital of France is Paris."
- "Paris, the capital of France, is located in the north-central part of the country..."

All three are correct. But `expect(output).toBe('Paris')` passes only one. You cannot assert string equality on LLM outputs.

**You need statistical scoring, not boolean assertions.** A test suite that says "87% of my outputs contain the correct answer" is meaningful; one that says "the output is exactly X" is brittle and wrong.

### 2.2 A single run is not a single request

An agent run is a **loop** — a stateful, multi-turn process:

```
User question
  → Turn 1: model generates → tool call → tool executes → tool result back
  → Turn 2: model generates → another tool call → result back
  → Turn 3: model generates → final answer
```

Each turn is a new LLM call. Each tool call might call sub-agents. State compacts when context fills up. Structured outputs may fail parsing and trigger auto-repair. Budgets exceed. HITL pauses the run for human approval, possibly for hours.

A traditional APM trace (HTTP request → spans → done) does not model this. You need spans that represent **turns**, **tool calls**, **structured-output repair attempts**, **compaction events**, **handoffs between sub-agents**, **budget-exceeded warnings**, and **checkpoints**. That's why `@harness/observability` defines its own event vocabulary (`packages/core/src/events.ts`) on top of OpenTelemetry, rather than reusing HTTP semantics.

### 2.3 "Correctness" is multi-dimensional

For a REST endpoint, correctness is one bit: right HTTP status + right JSON. For an agent answering a research question, "correct" includes:

| Dimension | Example signal |
|---|---|
| **Factual accuracy** | Did it include the expected fact? |
| **Tool usage** | Did it actually call `webSearch` instead of hallucinating? |
| **Format compliance** | Is the output valid JSON against the schema? |
| **Latency / cost budget** | Did it finish under 30s / $0.10? |
| **Conversational quality** | Is the tone right? Is it polite? Did it refuse unsafe requests? |
| **Reasoning quality** | Are the intermediate steps coherent? |

You can't express all of this in a single `expect()`. You need **multiple scorers per example**, each producing a 0–1 score, and you care about the *distribution* across a dataset — not a single green/red light.

### 2.4 Failures are often invisible to logs

A traditional bug throws. You see a stack trace.

An agent bug says "Paris, France's capital, was founded in 1823" — syntactically fine, but the date is wrong. Nothing threw. No 500. The only way to catch it is to *score the output against a known-good answer*, or have another model judge it. This is why eval is not optional for agent systems — there is no other safety net.

---

## 3. What "Eval" actually is — and how it differs from tests

### Tests vs. Eval side-by-side

| Dimension | Unit test | Eval |
|---|---|---|
| **Determinism** | Required | Not required |
| **Assertion style** | `expect(x).toBe(y)` — binary | Scorer returning 0..1 — continuous |
| **Success criterion** | All pass | Average score above a threshold |
| **Dataset size** | 1 assertion per test | N examples per suite, each scored |
| **When it runs** | Every commit (milliseconds) | Before release or nightly (seconds to minutes) |
| **What "flaky" means** | Bad — fix it | Expected — dataset-level averages smooth it out |
| **Replayable** | Yes, trivially | Yes, but output may differ each time |
| **Cost** | Free | Costs tokens (and sometimes judge tokens on top) |
| **Fix loop** | Edit code, rerun | Edit **prompts**, dataset, or model — rerun |

### The four kinds of scorers

1. **Deterministic output scorers.** `exactMatch`, `includes`, regex checks. Cheap, fast, zero drift. Use whenever the expected answer is structured (numbers, dates, names).
2. **Structural / behavioral scorers.** `toolCalled(name)`, `finishedWithin(ms)`. Check *what the agent did*, not what it said. Critical for tool-using agents.
3. **Schema scorers.** Validate output against a Zod schema. 1 if parses, 0 if not. Especially important when you use `responseFormat`.
4. **LLM-as-judge.** Another model scores the output on a rubric. Expensive, noisy, and model-dependent — but the only option for open-ended quality (tone, completeness, reasoning). In this repo: `packages/eval/src/scorers/llm-judge.ts`.

### The eval lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│  dataset (N examples: input + optional expected)             │
│         │                                                    │
│         ▼                                                    │
│  task(input) → output             (runs your agent)          │
│         │                                                    │
│         ▼                                                    │
│  scorers: [s1, s2, s3]            (run against each output)  │
│         │                                                    │
│         ▼                                                    │
│  results.jsonl + report.html      (distributional view)      │
│         │                                                    │
│         ▼                                                    │
│  --score-threshold 70             (CI gate)                  │
└──────────────────────────────────────────────────────────────┘
```

### Why it's a distribution, not a gate

Suppose you change a system prompt. Run the eval:

- Before: avg score 0.82, `factual` 0.90, `toolCalled` 0.95, `tone` 0.60
- After:  avg score 0.85, `factual` 0.88 (–), `toolCalled` 0.97, `tone` 0.78 (+)

You gained tone, lost a hair of factual accuracy. Is this good? That's a product call. Tests can't tell you this because tests aren't a continuous signal — they're a lock. Eval is a *measurement instrument* you use to navigate trade-offs.

### What eval does **not** replace

- **Unit tests for deterministic code.** Your scorers, your parsers, your event-bus logic, your retry policy — all of that is normal code and gets normal unit tests. That's why this repo keeps `bun test` (TDD for `packages/*`) and `.eval.ts` files separate.
- **Schema contracts.** Zod schemas are still your runtime guard, just like in any TS app.

---

## 4. What "AI observability" actually is — and how it differs from APM

### APM vs. agent observability

| Dimension | APM | Agent observability |
|---|---|---|
| **Unit of trace** | HTTP request | Agent `run` (multi-turn) |
| **Span children** | Database queries, RPC calls, renders | `turn`, `provider`, `tool`, sub-agent handoffs |
| **Key metrics** | p95 latency, error rate, RPS | Tokens in/out, cost $, tool-call count, turn count, compaction events |
| **What you debug** | "Why is this endpoint slow?" | "Why did the agent call the wrong tool?" "Why did it keep retrying?" "Where did the cost come from?" |
| **Data sensitivity** | Request/response bodies sometimes redacted | **Prompts & outputs often contain PII** — redaction is mandatory |
| **Payload size** | KB range | Prompts routinely hit 10k–100k chars; sinks **must truncate** |
| **Sampling** | 1–10% typical | Usually 100% in dev/eval; sampled only in production |

### What an agent trace looks like in this repo

Produced by `otelAdapter` (`packages/observability/src/otel-adapter.ts`):

```
harness.run                                 (session-scoped)
├── harness.turn (turn=1)
│   ├── harness.provider  [providerId=ollama, inputTokens=420, outputTokens=88]
│   └── harness.tool      [toolName=webSearch, durationMs=312]
├── harness.turn (turn=2)
│   ├── harness.provider  [providerId=ollama, inputTokens=621, outputTokens=34]
│   └── harness.tool      [toolName=fetchPage, durationMs=980]
└── harness.turn (turn=3)
    └── harness.provider  [providerId=ollama, inputTokens=780, outputTokens=412]
```

Attached as span events (not spans — these are point-in-time annotations):

- `budget.exceeded` — model started talking but we hit the cost cap
- `guardrail` — an input/output guard fired
- `handoff` — control passed to a sub-agent
- `compaction` — old turns were summarised to fit context
- `checkpoint` — HITL paused here

No traditional APM gives you these semantics for free. This is the whole reason `@harness/observability` exists.

### The event bus as the universal interconnect

All of this hangs off one abstraction: `EventBus` in `@harness/core`. The agent emits typed events; sinks subscribe. Every integration (console, JSONL, OpenTelemetry, Langfuse) is just a subscriber. Look at `packages/observability/src/langfuse-adapter.ts` — 190 lines, zero surprises, pure event → external shape mapping.

Why this matters: **the same bus that powers live observability also powers offline eval**. If your scorer needs to check "did the agent call `webSearch`?", it reads the same events the OTel trace reads. One source of truth.

### What to actually *look at* in a trace

When something goes wrong, the order of investigation is:

1. **Final output** — is it wrong, missing, malformed, or just lower quality?
2. **Token counts per turn** — runaway growth? Likely compaction isn't firing, or the agent is in a loop.
3. **Tool calls** — did it call what you expected? Wrong args?
4. **`provider.retry` events** — if many, your provider is unhappy (rate-limited, bad schema, etc.).
5. **`structured.repair` events** — model is producing invalid JSON; your schema or prompt needs work.
6. **`budget.exceeded`** — cost/token limits hit; investigate whether the run legitimately needed it.

These have no APM analogue. `provider.retry` is roughly "HTTP 429" but its cause is model/provider-specific. `structured.repair` has no traditional cousin at all — it's the machinery of turning "the LLM kind of got the JSON right" into a usable object.

---

## 5. How eval and observability fit together

People sometimes think of them as separate stacks. They're not — they share the event bus:

```
                  ┌──────────────────────────┐
                  │    agent.stream(...)     │
                  │   emits events to bus    │
                  └──────────┬───────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         consoleSink     jsonlSink      otelAdapter
         (dev live)     (replay)      (Jaeger/etc)
                             │
                             │      (same events feed eval)
                             ▼
                   scorers read events
                   (e.g. toolCalled reads tool.start/tool.finish)
                             │
                             ▼
                     scored dataset
                   → CI gate, report
```

- **Observability during development.** You're iterating. `consoleSink` for live chatter, OTel/Jaeger when you need the flame graph, `jsonlSink` when you want to diff two runs.
- **Eval before release.** You run `.eval.ts` files against a curated dataset; the runner captures events; scorers turn them into a score distribution; the CI gate prevents regression. If a commit drops your factual-accuracy score from 0.88 to 0.72, CI fails the same way a broken unit test would — just based on a different kind of signal.
- **Observability in production.** Same `otelAdapter` or `langfuseAdapter` — now pointing at real backends. You sample traces; you look at token costs; you feed bad ones back into the eval dataset as regression cases. This is the loop that actually matures an agent system.

---

## 6. Concrete mapping in this repo

| Concept | File / package | Notes |
|---|---|---|
| Event bus | `@harness/core` — `EventBus`, `HarnessEvents` | Single source of truth for everything below |
| Sink: live console | `packages/observability/src/console-sink.ts` | `quiet` / `normal` / `verbose` levels |
| Sink: JSONL replay | `packages/observability/src/jsonl-sink.ts` | 10KB string truncation + secret redaction |
| Sink: OpenTelemetry | `packages/observability/src/otel-adapter.ts` | Proper span hierarchy + error status |
| Sink: Langfuse | `packages/observability/src/langfuse-adapter.ts` | Optional peer dep |
| Secret redaction | `packages/observability/src/sanitize.ts` | Used by `jsonlSink`; good pattern for custom sinks |
| Scorer factory | `packages/eval/src/create-scorer.ts` | Generic, validates finite scores |
| Deterministic scorers | `packages/eval/src/scorers/{exact-match,includes,tool-called,finished-within}.ts` | |
| LLM judge | `packages/eval/src/scorers/llm-judge.ts` | Uses `responseFormat` — no string parsing |
| Export: Inspect-AI | `packages/eval/src/export/inspect-log.ts` | Open offline in Inspect viewer |
| Export: Langfuse | `packages/eval/src/export/langfuse.ts` | Push eval results as a trace |
| CLI runner | `packages/cli/src/bin.ts` | Matrix runs, thresholds, exports |

---

## 7. Practical implications (what to actually do)

### 7.1 Write unit tests for your deterministic code, eval for your agent behavior

- Parsers, retry policy, budget math, checkpoint persistence → **unit tests**.
- "Does the agent answer factual questions correctly?" → **eval**.
- "Does the agent refuse harmful requests?" → **eval with a specific dataset**.
- "Does structured output parse 99% of the time?" → **eval with a schema scorer**.

They are not competing; they are complementary. The line is: **if the function is deterministic, unit-test it. If the behavior involves an LLM call, eval it.**

### 7.2 Treat prompts as production config, not code

When you change `plannerPrompt`, you are not fixing a bug — you are tuning a statistical system. Always run eval before and after. Otherwise you're making blind changes.

### 7.3 Grow your eval dataset from production failures

Every time a user reports "the agent did X wrong," that's a new eval example. Capture it from `jsonlSink` or Langfuse, reduce it to `{ input, expected }`, add to the dataset. This is the flywheel.

### 7.4 Decide your quality budget per dimension

Pick 3–5 scorers aligned to your product's requirements. Set thresholds per scorer, not just the average. Example for Deep Research:

| Scorer | Min score |
|---|---|
| `includes(expected)` (factual) | ≥ 0.80 |
| `toolCalled('webSearch')` | ≥ 0.95 |
| `finishedWithin(45_000)` | ≥ 0.90 |
| `llmJudge(tone)` | ≥ 0.70 |

CI fails if any drops below its threshold. Forces you to address regressions per-dimension rather than getting masked by a high average.

### 7.5 Use observability to debug eval failures

When an eval score drops, the JSONL/Langfuse trace tells you *why*: was it a schema-repair failure? A bad tool arg? A turn limit? Don't rerun blindly — read the trace.

### 7.6 Redact. Always.

`sanitize.ts` redacts the obvious keys. If your prompts contain user PII, add your own redaction before events hit Langfuse. Traces are forever once they're in an external system.

---

## 8. TL;DR

- **Traditional tests** assume determinism, give binary answers, run in milliseconds, and are free.
  **Eval** handles non-determinism, gives a score distribution, runs in seconds–minutes, and costs tokens.
- **APM** traces HTTP requests as spans; it has no opinion about turns, tool calls, token cost, or structured-output repair.
  **Agent observability** models those explicitly — run → turn → provider|tool — because that's what an agent actually does.
- Both systems hang off the **same event bus**. Live observability and offline eval are two consumers of the same stream of typed events. Once you grok that, the split between them is just "am I watching this now" vs. "am I scoring this against a dataset."
- The shift from traditional software is a shift in mindset: **from proving correctness to measuring quality.** You'll keep your unit tests. You'll add eval on top. And your observability becomes a semantic tool for reasoning about agent behavior, not just a performance dashboard.
