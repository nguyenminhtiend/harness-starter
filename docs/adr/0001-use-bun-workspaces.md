# ADR-0001: Use Bun workspaces as the monorepo backbone

**Status:** Accepted
**Date:** 2026-04-17
**Deciders:** project architects

## Context

The harness-starter is a multi-package monorepo (9 libraries + 2 apps) that must build, typecheck, and test quickly on a laptop and in CI. Monorepo tooling candidates considered:

1. **Bun workspaces** — zero-config, no separate task runner, native TypeScript, fast install, bundled test runner.
2. **Turborepo** — task graph + caching over an npm/pnpm/yarn workspace.
3. **Nx** — full-featured monorepo platform with codegens, affected-change tracking, dependency graph UI.
4. **pnpm workspaces** — efficient install, decent workspace story, but needs a task runner layer on top (Turbo/Nx).

The project targets both Node 22 and Bun, with `@harness/core` constrained to Web-standard APIs only. Bun is already a first-class runtime for at least one of the demo apps.

## Decision

Use **Bun workspaces** and nothing else — no Turbo, no Nx.

## Consequences

### Positive

- **Zero config.** `workspaces: ["packages/*", "apps/*"]` in root `package.json` is the entire monorepo wiring.
- **One toolchain.** `bun install`, `bun run`, `bun test`, `bun x` replace npm + a test runner + a task runner.
- **Fast.** `bun install` and `bun test` are materially faster than the npm+Vitest combo they replace.
- **Native TypeScript.** No Jest/tsx/ts-node shim for scripts or tests.
- **Simple mental model** — matches the clone-and-own ethos: fewer tools for downstream forks to understand and maintain.

### Negative / trade-offs

- **No free task graph caching.** Turbo's `--filter=...^...` ancestor-aware runs and build caching are absent. Acceptable now at 9 packages; revisit if build times cross ~30s.
- **Bun CLI churn.** Minor-version changes have shifted `--filter` syntax (e.g. the spec's `bun --filter '*' run <script>` became `bun run --filter '*' <script>` in Bun 1.3). Roadmap must occasionally re-verify commands.
- **Node-only clones** lose some DX (`bun install`, `bun test`) and must use `npm` + `vitest` fallbacks. Mitigated because `@harness/core` targets Web APIs and nothing else in the starter requires Bun-only runtime features for production use.
- **Filter on empty workspace errors.** `bun run --filter '*' <script>` exits non-zero when no workspace members match. Phase 0 ships a `packages/_smoke/` placeholder to keep the empty scaffold green; it's deleted when real packages land in Phase 1.

## Alternatives rejected

- **Turbo or Nx** — unnecessary tooling surface for the current package count; most of their value is cache/graph features we can't fully exploit without building remote cache infra. Deferred until we outgrow Bun's built-ins.
- **pnpm workspaces** — requires pairing with a separate task runner, defeating the "one toolchain" goal.

## Revisit when

- Monorepo exceeds ~20 packages.
- `bun run ci` exceeds 30s on a laptop.
- Bun's roadmap stalls or a critical Node-only dependency cannot ship a Bun-compatible version.
