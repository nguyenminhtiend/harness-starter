# Eval & Observability Review + Local-Ollama Setup Guide

_Date: 2026-04-21_

---

# Part 1 — Package Review

## `packages/eval` — best-practice audit

**What's there:** thin wrapper over [evalite](https://evalite.dev) + harness-specific scorers and export adapters.

| Area | Status | Note |
|---|---|---|
| API surface | ✅ Clean | Re-exports `evalite`, exposes `createScorer`, 5 scorers, 2 export adapters |
| Optional peer dep (`langfuse`) | ✅ | Correctly `optional: true` — matches clone-and-own invariant |
| `createScorer` typing | ✅ | Generic over `TInput, TOutput, TExpected`; validates `Number.isFinite(score)` |
| `llmJudge` uses `responseFormat` | ✅ | Good — uses the harness's structured-output story, not string parsing |
| **No `.eval.ts` files exist yet** | ⚠️ | Framework wired, zero adoption. The first eval is the biggest win. |
| `evalite` concurrency caveat | ⚠️ | `packages/cli/src/bin.ts:61` forces concurrency=1 when matrixing across models (shared `process.env.HARNESS_EVAL_MODEL`) — documented, fine, but worth knowing |

Overall: solid. Nothing to refactor.

## `packages/observability` — best-practice audit

**What's there:** 4 event-bus sinks → external formats.

| Area | Status | Note |
|---|---|---|
| Runtime boundary | ✅ | Only `node:fs/promises` in `jsonlSink`. No Node deps in other sinks — core-compatible. |
| Unsub contract | ✅ | Every sink returns `() => void` that tears down every subscription |
| Secret redaction (`sanitize.ts`) | ✅ | Redacts `apikey/token/password/secret/authorization/credential/privatekey`, truncates strings >10k, recursion capped at depth 8 |
| OTel span hierarchy | ✅ | `run → turn → (provider|tool)`; orphan spans closed on `run.finish` / `run.error`; nested tool calls tracked via per-tool stacks |
| Langfuse adapter | ✅ | Correct trace → span/generation mapping; cleans up all per-run maps on run end |
| `jsonlSink` error handling | ⚠️ | `.catch(() => {})` silently swallows write errors — defensible (no way to log without coupling), but note it exists |
| `consoleSink` missing timestamps | ⚠️ | Events have no timestamp prefix — fine for humans tailing live, less useful in scrollback |
| Exhaustiveness check in `jsonlSink` | ✅ | `_AssertExhaustive` type trick forces a compile error if a new `HarnessEvents` key is added but not listed |

Overall: well-designed. No changes needed.

## Web-studio wiring (current state)

- `apps/web-studio/src/server/features/sessions/sessions.runner.ts:79` uses `consoleSink` only.
- No `jsonlSink` (misses a cheap win — per-session disk replay).
- Default model at `apps/web-studio/src/shared/settings.ts:30` is `google:gemini-2.5-flash`.
- Ollama support is already wired in `packages/llm-adapter/src/provider.ts:46-50` (defaults to `http://localhost:11434/v1`).

---

# Part 2 — Set Up Web-Studio for Ollama-Only

You have `qwen2.5:3b` pulled and Ollama running at `:11434`. Two small changes make web-studio fully local.

### Step 1 — Flip the default model

Edit `apps/web-studio/src/shared/settings.ts:30`:

```ts
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  defaultModel: 'google:gemini-2.5-flash',   // ← change this
  budgetUsd: 0.5,
  budgetTokens: 200_000,
  concurrency: 3,
};
```

Change `defaultModel` to `'ollama:qwen2.5:3b'`. The UI picker (fed by `GET /api/models` → `listAvailableModels`) already includes the ollama entry unconditionally (`packages/llm-adapter/src/catalog.ts:40-42` — ollama shows with no key).

Also fallback in `sessions.runner.ts:50`:
```ts
const modelSpec = (mergedSettings.model as string) ?? 'google:gemini-2.5-flash';
```
Change to `'ollama:qwen2.5:3b'`.

### Step 2 — Point `.env` at Ollama, drop paid keys

Edit `/Users/messi/Projects/Others/harness-starter/.env`:

```bash
# Local-only setup
OLLAMA_BASE_URL=http://localhost:11434/v1
# Comment out or delete the paid keys:
# GOOGLE_GENERATIVE_AI_API_KEY=...
# OPENROUTER_API_KEY=...
```

`loadProviderKeysFromEnv()` already reads `OLLAMA_BASE_URL` (`packages/llm-adapter/src/keys.ts:17-20`).

### Step 3 — Run it

```bash
bun install
bun run --filter @harness/example-web-studio dev
# or: cd apps/web-studio && bun run dev
```

Then open http://localhost:3000. In the settings panel pick `Qwen 2.5 3B (local)` if it's not already default.

### Caveats with a 3B local model

- `@harness/example-web-studio`'s Deep Research tool relies on structured output + tool calling. `qwen2.5:3b` supports tool calling but quality is modest. Expect retries. Consider pulling a stronger local model:
  ```bash
  ollama pull qwen2.5:7b-instruct    # better tool-calling
  ollama pull llama3.1:8b            # good general
  ```
  Add them to `packages/llm-adapter/src/catalog.ts` — one line each.
- The HITL plan-approval flow serializes JSON schemas; small models occasionally produce slightly off schemas and the harness auto-repairs (`structured.repair` event). Watch the console sink.

---

# Part 3 — Beginner → Advanced Guide: Observability & Eval

This is the mental model to hold. Everything else is mechanical.

> **Observability** = "what did my agent *just do*?" Live events + traces.
> **Eval** = "does my agent *still work correctly*?" Offline, scored, regression-gated.

Same system, different questions.

## 3.1 Basics: the event bus

Every `agent.stream(...)` call in harness emits typed events on an `EventBus`. A **sink** is a function that subscribes. That's the whole API.

```ts
import { createEventBus } from '@harness/core';
import { consoleSink, jsonlSink } from '@harness/observability';

const bus = createEventBus();
const unsubConsole = consoleSink(bus, { level: 'normal' });
const unsubFile    = jsonlSink(bus, { path: './events.jsonl' });

// pass `bus` to your agent. agent.stream(... , { bus }) wires it in.
// when done:
unsubConsole(); unsubFile();
```

Levels you care about:
- `quiet` — only `run.start/finish/error`, `budget.exceeded`. Use in tests.
- `normal` — adds turn/tool/guardrail/handoff/compaction. **Default for dev.**
- `verbose` — adds provider-call events and structured-output repair attempts. Use when debugging a weird output.

After a run, `tail events.jsonl` is a goldmine. Every event is `{ timestamp, event, payload }`.

## 3.2 Intermediate: OpenTelemetry traces, all local

Run Jaeger locally in Docker:

```bash
docker run -d --name jaeger \
  -p 16686:16686 -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Install once:
```bash
bun add @opentelemetry/api @opentelemetry/sdk-trace-node \
        @opentelemetry/exporter-trace-otlp-http
```

Wire it:
```ts
import { NodeTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace } from '@opentelemetry/api';
import { otelAdapter } from '@harness/observability';

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new BatchSpanProcessor(
  new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
));
provider.register();

const unsub = otelAdapter(bus, trace.getTracer('harness'));
```

Open http://localhost:16686. You'll see `harness.run` → `harness.turn` → `harness.provider` / `harness.tool` spans with token counts as attributes. This is the right intermediate tool — you *see* the flame graph of an agent run.

## 3.3 Intermediate: first eval file

Create `apps/web-studio/src/server/features/deep-research/deep-research.eval.ts`:

```ts
import { evalite } from '@harness/eval';
import { includes, finishedWithin } from '@harness/eval/scorers';
import { createProvider } from '@harness/llm-adapter';

const provider = createProvider(
  { ollamaBaseUrl: 'http://localhost:11434/v1' },
  process.env.HARNESS_EVAL_MODEL ?? 'ollama:qwen2.5:3b',
);

evalite('Deep Research — smoke', {
  data: [
    { input: 'What year did the Apollo 11 moon landing happen?', expected: '1969' },
    { input: 'Capital of Japan?', expected: 'Tokyo' },
  ],
  task: async (input) => {
    const started = Date.now();
    const { message } = await provider.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
    });
    const text = typeof message.content === 'string'
      ? message.content
      : message.content.filter(p => p.type === 'text').map(p => p.text).join('');
    return { text, durationMs: Date.now() - started };
  },
  scorers: [
    { name: 'includes', scorer: ({ output, expected }) =>
        output.text.toLowerCase().includes(String(expected).toLowerCase()) ? 1 : 0 },
    finishedWithin(30_000),
  ],
});
```

Run it:
```bash
bunx evalite watch apps/web-studio/src/server/features/deep-research/deep-research.eval.ts
# UI at http://localhost:3006
```

## 3.4 Intermediate: LLM-as-judge, running locally

For open-ended outputs, exact-match fails. Use `llmJudge` — it re-uses your Ollama provider:

```ts
import { llmJudge } from '@harness/eval/scorers';

const judge = llmJudge({
  provider,
  prompt: `Rate 0 to 1 whether OUTPUT correctly answers INPUT given EXPECTED.
Respond with JSON: { "score": number, "rationale": string }.`,
});

// scorers: [judge]
```

`llmJudge` already uses `responseFormat` under the hood (`packages/eval/src/scorers/llm-judge.ts:43`), so schema-validation + structured-repair are handled for you.

Trade-off: small local judges (3B–7B) are noisy. Use `includes`/`exactMatch` where possible; reserve the judge for quality dimensions like "is this answer polite" or "does it cite the tool output."

## 3.5 Advanced: matrix runs + reports via `@harness/cli`

Once you have several `.eval.ts` files:

```bash
bun run eval \
  --models ollama:qwen2.5:3b,ollama:llama3.1:8b \
  --concurrency 1 \
  --export inspect \
  --score-threshold 70 \
  "apps/**/*.eval.ts"
```

- `--export inspect` emits [Inspect-AI](https://inspect.aisi.org.uk/) JSON → open in their viewer, fully offline.
- `--score-threshold 70` exits non-zero if the average score drops below 70% → wire into `bun run ci` for regression gating.
- Output goes to `.harness/reports/<ts>/`: `results.jsonl` + `report.html`.

## 3.6 Advanced: wire observability into the web-studio (optional improvement)

The runner at `apps/web-studio/src/server/features/sessions/sessions.runner.ts:79` only uses `consoleSink`. Add a per-session JSONL log — useful when a user reports "the agent did X, why?":

```ts
// in sessions.runner.ts, inside generate():
const unsubConsole = consoleSink(bus, { level: 'normal' });
const unsubJsonl   = jsonlSink(bus, { path: `${process.env.DATA_DIR ?? '.'}/events-${sessionId}.jsonl` });
// ... in finally:
unsubConsole(); unsubJsonl();
```

Each session becomes a self-contained JSONL file you can replay or diff.

## 3.7 Advanced: custom scorers for agentic behavior

The pre-built `toolCalled(name)` is the most important one once you have multi-tool agents — it asserts **the agent called the right tool**, not just "output looked right." Combine with a lightweight output check:

```ts
import { toolCalled, includes } from '@harness/eval/scorers';

scorers: [
  toolCalled('webSearch'),   // gate: it must have searched
  includes({ ignoreCase: true }),
],
```

For your agent's `output` to score with `toolCalled`, surface the events array or `toolCalls` on the returned object — see `packages/eval/src/scorers/tool-called.ts`. The observability events you already emit on the bus are the natural source.

---

# Summary

- Both packages are in good shape and follow the starter's invariants. Main gap: **no `.eval.ts` files exist yet** — write one today.
- For local-only: flip `defaultModel` in `apps/web-studio/src/shared/settings.ts:30` + fallback in `sessions.runner.ts:50`, set `OLLAMA_BASE_URL` in `.env`. `qwen2.5:3b` will work but pull a 7B/8B model for tool-heavy Deep Research.
- Mental model: observability is "what happened?" (live events), eval is "does it still work?" (scored regression). Same event bus feeds both.
- Progression: `consoleSink` → `jsonlSink` → Jaeger/OTel → first `.eval.ts` → `llmJudge` → matrix runs with threshold gating.
