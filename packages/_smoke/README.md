# `@harness/_smoke` — scaffolding placeholder (delete in Phase 1)

This package exists only so Phase 0's empty scaffold passes CI. It gives the repo:

- **A workspace member** so `bun --filter '*' run <script>` has something to match (Bun errors on empty filter matches).
- **One trivial test** so `bun test` finds at least one file (Bun's test runner errors when zero test files match).

Phase 1 (`@harness/core`) brings real content. Once `packages/core/` has its own `package.json` and test file, delete this whole directory — nothing else depends on it.
