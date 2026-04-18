# Phase 8 — `@harness/cli` Tasks

## Phase A: Scaffold

- [x] **Task 1:** Scaffold `packages/cli` (package.json, tsconfig, biome override, bin entry stub, `bun install`)

**Checkpoint:** Package builds, `bun run ci` green

## Phase B: CLI Foundation

- [x] **Task 2:** CLI types + arg parser — TDD (11 tests)
- [x] **Task 3:** Eval file discovery via glob — TDD (6 tests)

**Checkpoint:** CLI can parse args and discover eval files; `bun run ci` green

## Phase C: Eval Execution

- [x] **Task 4:** Single-eval runner wrapper — TDD (5 tests)
- [x] **Task 5:** Model matrix orchestrator + concurrency — TDD (6 tests)

**Checkpoint:** Full eval execution pipeline works end-to-end with mock runner; `bun run ci` green

## Phase D: Output & Reporting

- [x] **Task 6:** Results collector + JSONL writer — TDD (6 tests)
- [x] **Task 7:** HTML report generator — TDD (7 tests)

**Checkpoint:** Full pipeline produces JSONL + HTML report; `bun run ci` green

## Phase E: Export & Polish

- [x] **Task 8:** Export adapter bridge — TDD (5 tests)
- [x] **Task 9:** Wire bin entry, root script, README, clone-and-own check

## Exit Criteria

- [x] `harness-eval "packages/**/*.eval.ts"` discovers evals
- [x] `--models` matrix fans out per model
- [x] `--concurrency N` honored
- [x] HTML report + `results.jsonl` written under `.harness/reports/<timestamp>/`
- [x] `--export inspect,langfuse` triggers the respective adapters
- [x] `bun run ci` all green (46 CLI tests, 237 existing tests = 283 total)
- [x] Clone-and-own: deleting `packages/cli/` leaves 237 tests passing
