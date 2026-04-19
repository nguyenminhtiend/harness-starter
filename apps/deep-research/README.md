# deep-research

Local-first CLI that produces well-cited markdown research reports. It orchestrates a **planner → N parallel researchers → writer → fact-checker** pipeline using the full harness surface (`graph`, `subagentAsTool`, `handoff`, budgets, observability, TUI).

> See [`docs/spec-deep-research.md`](../../docs/spec-deep-research.md) for the full specification.

## Quick start

```bash
# From the repo root
bun install

# Set your API key
export OPENROUTER_API_KEY="sk-or-..."

# Run
bun run --filter @harness/example-deep-research dev -- "What are CRDTs?"
```

A markdown report lands in `./reports/` by default.

## CLI flags

| Flag | Description | Default |
|------|-------------|---------|
| `--depth <shallow\|medium\|deep>` | Number of subquestions (3/5/8) | `medium` |
| `--out <dir>` | Output directory for reports | `./reports` |
| `--no-file` | Stdout only, skip file write | off |
| `--no-approval` | Skip HITL plan approval | off |
| `--ephemeral` | In-memory store (no sqlite) | off |
| `--budget-usd <n>` | Hard dollar ceiling | `0.50` |
| `--budget-tokens <n>` | Hard token ceiling | `200000` |
| `--model <id>` | Override the model ID | `openrouter/auto` |
| `--resume <id>` | Resume a checkpointed run | — |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | **yes** | OpenRouter API key |
| `MODEL_ID` | no | Model to use (`openrouter/auto`) |
| `BRAVE_API_KEY` | no | Enables Brave Search MCP tool |
| `BUDGET_USD` | no | Default dollar budget (`0.50`) |
| `BUDGET_TOKENS` | no | Default token budget (`200000`) |
| `REPORT_DIR` | no | Report output directory (`./reports`) |
| `DATA_DIR` | no | SQLite storage path (`~/.deep-research`) |
| `LANGFUSE_PUBLIC_KEY` | no | Enables Langfuse tracing |
| `LANGFUSE_SECRET_KEY` | no | Langfuse secret |
| `LANGFUSE_BASE_URL` | no | Langfuse endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | OpenTelemetry endpoint |

## Architecture

```
question
  │
  ▼
┌──────┐   ┌─────────┐   ┌──────────┐   ┌───────┐   ┌────────────┐   ┌──────────┐
│ plan │──▶│ approve │──▶│ research │──▶│ write │──▶│ fact-check │──▶│ finalize │
└──────┘   └─────────┘   └──────────┘   └───────┘   └────────────┘   └──────────┘
                                │                          │
                                │                     fail + retries < 2
                                │                          │
                                │                     ┌────┘
                                │                     ▼
                                │                  (retry → write)
                                │
                          N parallel researcher
                          subagents (subagentAsTool)
```

- **plan** — LLM generates subquestions + search queries (structured output via Zod).
- **approve** — HITL interrupt; user reviews the plan before spending budget. Skip with `--no-approval`.
- **research** — Each subquestion dispatched to a researcher subagent that calls `fetchTool` (and optionally Brave Search MCP).
- **write** — Writer agent composes a markdown report from aggregated findings.
- **fact-check** — Verifier checks citations. On failure, the graph retries the write→fact-check loop (max 2 retries).
- **finalize** — Terminal node; report is written atomically to disk.

## Output format

Reports are saved as `<slug>-<timestamp>.md` in the output directory. An accompanying `.events.jsonl` file captures all agent events for debugging/replay.

## Persistence

By default, state is persisted to SQLite (`~/.deep-research/`). Use `--ephemeral` for in-memory mode. If `@harness/memory-sqlite` is not installed, the app gracefully falls back to in-memory storage.

Checkpointing enables `--resume <runId>` to pick up where a run left off (e.g., after reviewing a plan).

## Evals

```bash
HARNESS_LIVE=1 bun run --filter @harness/example-deep-research eval
```

Evals are gated behind `HARNESS_LIVE=1` and excluded from `bun test`. They include:

- **factuality** — LLM-judge scoring of report accuracy
- **citation** — Presence and domain coverage of URLs in reports

## Fork and customize

This app is designed as a **clone-and-own** template. To adapt it for your domain:

1. **Swap tools** — Replace or extend `src/tools/search.ts` with domain-specific tools (e.g., PubMed, SEC EDGAR, case law databases).
2. **Edit prompts** — Agent system prompts live in `src/agents/planner.ts`, `researcher.ts`, `writer.ts`, and `fact-checker.ts`.
3. **Change schemas** — Output schemas are in `src/schemas/plan.ts` and `src/schemas/report.ts`. Add fields, sections, or metadata as needed.
4. **Adjust the graph** — `src/graph.ts` defines the topology. Add nodes (e.g., a summarizer, a translator) or change edges.
5. **Tune budgets** — Edit ratios in `src/budgets.ts` (default: 10% planner, 60% research, 20% writer, 10% fact-checker).

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Budget exceeded or runtime error |
| 2 | User rejected plan |
| 3 | Fact-check failed after retries |
| 130 | SIGINT |
