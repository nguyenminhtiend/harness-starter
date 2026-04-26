# Observability & Eval Plan

Drafted 2026-04-25. Local-first; production deferred.

## Goals

1. See full local logs for tool calls and LLM input/output (currently only HTTP access logs surface — Mastra's internal logs are silently dropped because no logger is attached to `new Mastra(...)`).
2. Capture tool calls, args, and results with timing.
3. Integrate Mastra built-in scorers (`@mastra/evals`) into `simpleChatAgent` and `deepResearch` workflow tests.
4. Production observability (OTel exporter to a dashboard) is out of scope for now but the design must not block it.

## Bug analysis

`composeHarness` (`packages/bootstrap/src/compose.ts:55`) builds a pino logger and passes it to `RunExecutor` and to deep-research workflow steps. That covers `step.start` / `step.end` logs and access logs, but:

- **`new Mastra(...)`** at `mastra.config.ts:12` and `packages/mastra/src/capabilities/deep-research/capability.ts:37` get no `logger:`. Mastra's internal events (agent run, LLM call, tool execute) go to its default logger and never reach our pino instance.
- **Agent adapter** (`packages/mastra/src/capabilities/adapters/agent-adapter.ts`) only maps `fullStream` chunks to `SessionEvent`s for the SSE channel. Nothing is written to the developer log.
- **Tools** (`calculator`, `getTime`, `fs`, `fetch`) never call `mastra.getLogger()`.
- Mastra expects a `PinoLogger` from `@mastra/loggers`, not a raw `pino` instance — that's the supported handle returned by `mastra.getLogger()`.

## LLM payload policy (best practice)

| Log level | Fields |
| --- | --- |
| `info` (default) | `role`, `modelId`, `preview` (first ~300 chars + `…[+N more]`), `inputTokens`, `outputTokens`, `durationMs` |
| `debug` (gated by `HARNESS_LOG_LLM_FULL=1`) | full prompt + completion |
| Always on | pino `redact:` for `*.apiKey`, `*.authorization`, `*.cookie`, `*.password`, `req.headers.authorization` |

Rationale: previews are enough for "did the right tool fire / did the model say the right thing." Full payloads are huge, expensive to scroll, and leak PII. Token counts are the single highest-leverage metric and are cheap to read from `step-finish` chunks. An explicit env flag prevents full payloads from accidentally shipping to prod.

Helpers `previewText(s, max=300)` and `previewMessages(msgs)` live in `packages/core/src/infra/logger.ts`.

## Architecture decisions

- **Two logger types side by side**: keep raw `pino` from `@harness/core` for the executor / HTTP layer; build a `PinoLogger` (`@mastra/loggers`) bound to the same level + transport for `new Mastra(...)`. They write to the same stdout, just different handles.
- **AI Tracing optional, additive**: enable Mastra's `observability:` config so spans surface in Mastra Studio, but don't depend on it for the developer log. Console exporter behind `HARNESS_TRACE_CONSOLE=1`.
- **Tool log helper**: single `withLogging(tool)` wrapper; preserves existing `createTool` typing.
- **Adapter logs**: agent adapter and workflow adapter own the high-level `agent.start` / `agent.end` / `workflow.start` / `workflow.end` lines. Step-level logs stay in `wrapWithLogging`.
- **Scorers**: live, sampled scorers attached to `simpleChatAgent`; deep-research scorers run only in tests (too many steps to attach live).

## Tasks

Ordered. Each task is small enough to land in one PR / commit.

### 1. Logger helpers — preview + redact + dev pretty-print
**Files:** `packages/core/src/infra/logger.ts`, `packages/core/src/infra/logger.test.ts`
**Acceptance:**
- `previewText(s, max?)` returns `s` unchanged when `s.length <= max`; otherwise `${s.slice(0, max)}…[+N more]` where N is the dropped char count.
- `previewMessages(msgs)` returns `[{ role, preview }]` array.
- `createPinoLogger` accepts `{ level?, pretty?, redact? }`. When `pretty=true`, configures `pino-pretty` transport. Default `redact` paths cover the list above.
- Tests cover preview boundary cases (empty, exact max, over max), redaction, and that pretty mode doesn't crash when `pino-pretty` is not installed (falls back gracefully).

### 2. Wire `PinoLogger` from `@mastra/loggers` into `composeHarness`
**Files:** `packages/bootstrap/src/compose.ts`, `packages/bootstrap/package.json`, `packages/core/src/infra/logger.ts`
**Acceptance:**
- Add `@mastra/loggers` to bootstrap deps.
- `composeHarness` returns a new dep `mastraLogger: MastraLogger` alongside the existing `logger`.
- Both share the same level and pretty config.
- Existing tests still pass.

### 3. Pass logger into Mastra capability builders
**Files:** `packages/mastra/src/capabilities/deep-research/capability.ts`, `packages/mastra/src/capabilities/registry.ts`, `apps/api/src/index.ts`, `apps/cli/src/index.ts`
**Acceptance:**
- `deepResearchCapability` becomes a factory that takes a logger and passes it as `logger:` to `new Mastra(...)`.
- `simpleChatCapability` similarly.
- API/CLI bootstrap wires `deps.mastraLogger` through.
- After this change, running `bun run api` and starting a deep-research run prints Mastra workflow/agent log lines.

### 4. Mastra config: attach default logger for `mastra dev`
**Files:** `mastra.config.ts`
**Acceptance:**
- `mastra.config.ts` builds a `PinoLogger` with pretty transport when `NODE_ENV !== 'production'`.
- `bun run studio:dev` shows the same log shape as the API.

### 5. Tool logging helper + apply to all tools
**Files:** `packages/mastra/src/tools/lib/with-logging.ts` (new), `packages/mastra/src/tools/{calculator,get-time,fs,fetch}.ts`, plus tests
**Acceptance:**
- `withLogging(toolDef)` wraps a `createTool` definition. On execute it logs `tool.start` (toolId, args preview) and `tool.end` (status, durationMs, result preview).
- Args/result respect the `HARNESS_LOG_LLM_FULL` flag for full vs preview.
- All four existing tools wrapped. Their public exports unchanged. Existing tool tests still pass.
- New unit test asserts log shape for a sample tool.

### 6. Agent adapter logs
**Files:** `packages/mastra/src/capabilities/adapters/agent-adapter.ts`, `agent-adapter.test.ts`
**Acceptance:**
- Logs `agent.start` (capabilityId, prompt preview).
- For each `tool-call` and `tool-result` chunk in `fullStream`, emits `agent.tool-call` / `agent.tool-result` with previews.
- Logs `agent.end` (durationMs, output preview, token totals if present).
- Existing tests still pass; new test asserts the four log lines fire.

### 7. Workflow adapter top-level logs
**Files:** `packages/mastra/src/capabilities/adapters/workflow-adapter.ts`, `workflow-adapter.test.ts`
**Acceptance:**
- Logs `workflow.start` (workflowId, input preview) and `workflow.end` (status, durationMs).
- Step-level logs already covered by `wrapWithLogging` — do not duplicate.

### 8. AI Tracing (optional, additive)
**Files:** `packages/bootstrap/src/compose.ts`, `mastra.config.ts`
**Acceptance:**
- Pass `observability: { default: { enabled: true } }` to `new Mastra(...)` everywhere.
- When `HARNESS_TRACE_CONSOLE=1`, also enable the console exporter so spans print to stdout.
- No-op when env var unset; spans still recorded for Mastra Studio.

### 9. Scorer integration — `simpleChatAgent`
**Files:** `packages/mastra/src/agents/simple-chat.ts`, new test `simple-chat.evals.test.ts`, root `package.json` (add `@mastra/evals`)
**Acceptance:**
- Attach `answer-relevancy` (sample 0.1) and `toxicity` (sample 0.05) via the agent's `scorers:` field. Use `@ai-sdk/openai`'s `gpt-4.1-nano` for the LLM judge.
- Eval test: 5 prompt/response fixtures, manually run each scorer with `.run({ input, output })`, assert thresholds.
- Test gated behind `HARNESS_LIVE=1` per repo convention.

### 10. Scorer integration — deep-research workflow
**Files:** `packages/mastra/src/workflows/deep-research/{report-step,research-step,plan-step}.evals.test.ts`
**Acceptance:**
- `faithfulness` and `hallucination` against report-step output given research context.
- `tool-call-accuracy` against research-step.
- `completeness` against plan vs. report.
- Each test: ~3 fixtures, manual `.run()`, asserts thresholds.
- LLM-based scorers gated behind `HARNESS_LIVE=1`; code-based ones run unconditionally with `mockModel()`.

### 11. Docs
**Files:** `CLAUDE.md`
**Acceptance:**
- Document `HARNESS_LOG_LLM_FULL` and `HARNESS_TRACE_CONSOLE` flags.
- Note "eval tests live next to their target as `*.evals.test.ts`".
- One-paragraph note on the Mastra logger vs core pino split.

## Production handoff (out of scope, kept here for continuity)

When prod observability lands:

- Add `@mastra/otel-exporter`.
- Gate behind `HARNESS_OTEL_ENDPOINT`. Point at SigNoz / Datadog / Langfuse / etc.
- Replace dev pretty transport with JSON-to-stdout when `NODE_ENV=production`.
- No callsite changes if tasks 2–7 land cleanly.

## Estimate

- Tasks 1–4 (logger bug + wiring): ~1 hour. After this, AI logs show up locally — primary user request resolved.
- Tasks 5–7 (tool + adapter logs): ~1 hour.
- Task 8 (AI tracing): ~30 min.
- Tasks 9–10 (scorers): ~half a day, mostly fixture authoring.
- Task 11 (docs): ~15 min.
