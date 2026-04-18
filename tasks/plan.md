# Phase 8 — `@harness/cli` Plan

**Plan document:** [`docs/superpowers/plans/2026-04-18-phase-8-cli.md`](../docs/superpowers/plans/2026-04-18-phase-8-cli.md)

## Summary

Build `@harness/cli` — the `harness-eval` command that discovers `*.eval.ts` files, fans out across a model matrix, enforces concurrency limits, collects results, generates an HTML report + `results.jsonl`, and optionally triggers Inspect-AI / Langfuse export adapters from `@harness/eval`.

Core modules:
1. `args.ts` — CLI argument parser (built on `parseArgs` from `node:util`)
2. `discover.ts` — glob-based `*.eval.ts` file discovery
3. `runner.ts` — single eval run via `runEvalite()` from `evalite/runner`
4. `matrix.ts` — model × eval orchestrator with bounded concurrency
5. `results.ts` — result normalization + JSONL writer
6. `report.ts` — self-contained HTML report generator
7. `export.ts` — bridge to `@harness/eval`'s `toInspectLog()` + `toLangfuse()`

## Architecture

```
CLI entry (src/index.ts)
  │
  ├─ parseArgs() → CliConfig
  │
  ├─ discoverEvalFiles(glob) → string[]
  │
  ├─ runMatrix(files, models, concurrency)
  │     │
  │     ├─ For each (model × file):
  │     │     └─ runSingleEval(file, model)
  │     │           └─ runEvalite({ path, outputPath, ... })
  │     │                 env: HARNESS_EVAL_MODEL=<model>
  │     │
  │     └─ Collect EvalRunResult[]
  │
  ├─ writeJsonlResults(results, outputDir)
  │
  ├─ generateHtmlReport(results, outputDir)
  │
  └─ (if --export) runExports(results, adapters)
        ├─ toInspectLog()    ← from @harness/eval
        └─ toLangfuse()      ← from @harness/eval
```

## Key Decisions

1. **CLI parsing: `node:util` `parseArgs`** — zero deps, sufficient for the flag set (`--models`, `--concurrency`, `--export`, `--output`, `--score-threshold`). No framework needed.
2. **Eval execution: `runEvalite()` from `evalite/runner`** — official programmatic API. Accepts `path`, `outputPath`, `mode: "run-once-and-exit"`, `hideTable`, `disableServer`. Returns a Promise.
3. **Model injection via `HARNESS_EVAL_MODEL` env var** — eval files read this to configure their provider. Simple, zero-magic, documented convention. The CLI sets `process.env.HARNESS_EVAL_MODEL` before each run group.
4. **Concurrency pool** — simple Promise-based semaphore. Each (model × file) pair is a unit of work. `--concurrency N` caps parallel evalite invocations (default: 1, sequential).
5. **Output directory: `.harness/reports/<timestamp>/`** — ISO timestamp folder. Contains `results.jsonl` (one JSON object per line per eval result) + `report.html` (self-contained).
6. **HTML report: self-contained, no external deps** — embedded CSS, tabular layout showing model × eval scores. Static file, viewable offline.
7. **Export adapters are a thin bridge** — CLI imports `toInspectLog` / `toLangfuse` from `@harness/eval` and passes collected results. Langfuse export gated behind `HARNESS_LIVE=1` in the adapter (not the CLI).
8. **Evalite + Vitest as direct dependencies** — not peer deps, since the CLI directly calls `runEvalite()`. Pin evalite to `^0.19.0`.

## Dependency on Phase 7

This package imports from `@harness/eval`:
- `toInspectLog(results)` — converts results to Inspect-AI log format
- `toLangfuse(results)` — pushes trace to Langfuse

Phase 7 must land first. If building incrementally, Task 8 (export bridge) can be stubbed until `@harness/eval` exists.

## Won't Do (spec §9 non-goals)

- No built-in watch mode (evalite has its own; CLI is for CI batch runs)
- No agent-manifest loader — eval files are TS, not YAML
- No stateful HTTP session for serving reports
- No shell/code-exec tool
- No npm publishing

## File Structure

```
packages/cli/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts              # bin entry → parseArgs → orchestrate → report
    ├── types.ts              # CliConfig, EvalRunResult, ModelSpec
    ├── args.ts               # parseArgs wrapper
    ├── args.test.ts
    ├── discover.ts           # glob eval file discovery
    ├── discover.test.ts
    ├── runner.ts             # single evalite invocation wrapper
    ├── runner.test.ts
    ├── matrix.ts             # model × file orchestrator + concurrency pool
    ├── matrix.test.ts
    ├── results.ts            # JSONL writer + result normalization
    ├── results.test.ts
    ├── report.ts             # HTML report generator
    ├── report.test.ts
    ├── export.ts             # bridge to @harness/eval export adapters
    └── export.test.ts
```

## Task Graph

```
Task 1: Scaffold package
   │
   ├──> Task 2: CLI types + arg parser (TDD)
   │       │
   │       └──> Task 3: Eval file discovery (TDD)
   │               │
   │               └──> Task 5: Model matrix orchestrator (TDD)
   │
   ├──> Task 4: Single-eval runner wrapper (TDD)
   │       │
   │       └──> Task 5 (also depends on runner)
   │               │
   │               ├──> Task 6: JSONL result writer (TDD)
   │               │       │
   │               │       └──> Task 7: HTML report generator (TDD)
   │               │
   │               └──> Task 8: Export adapter bridge (TDD)
   │
   └──────────────────────> Task 9: Wire bin, root script, README, clone-and-own
```

Tasks 2, 3, 4 can partially parallelize. Task 5 merges them. Tasks 6, 7, 8 parallelize after 5.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Evalite is experimental (v0.19.0) | High — API breakage | Pin version, thin wrapper in `runner.ts`, isolate all evalite calls |
| Evalite `outputPath` JSON format undocumented | Med — may need reverse-engineering | Inspect actual output early (Task 4), write normalizer in `results.ts` |
| Bun + Evalite/Vitest interop | Med — Evalite wraps Vitest which is Node-first | Test in Task 4 (fail-fast); Bun has good Node compat but may need `bun --bun` flag |
| Model injection convention not enforced | Low — user error | Document in README, provide example eval file, possibly add helper to `@harness/eval` |
| `@harness/eval` not built yet (Phase 7) | High — export bridge can't be tested | Stub exports in Task 8; full integration after Phase 7 lands |

## Open Questions

1. **Evalite `outputPath` JSON schema** — need to inspect actual output to define `EvalRunResult` type accurately. Task 4 will resolve this.
2. **Should `--models` accept provider prefixes?** e.g. `openrouter:gpt-4o` vs just `gpt-4o`. Suggest: accept free-form strings, pass through as `HARNESS_EVAL_MODEL`. The eval file is responsible for parsing.
3. **HTML report interactivity** — should it be sortable/filterable or purely static? Suggest: static for v1, with a simple score matrix table. Can enhance later.
