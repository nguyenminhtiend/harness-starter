# Harness Starter

TypeScript-first, clone-and-own starter for building agentic AI systems. Layered modular monorepo on Bun workspaces.

**Status:** Pre-implementation — Phase 0 scaffold only. See [`docs/superpowers/plans/2026-04-17-harness-starter-roadmap.md`](docs/superpowers/plans/2026-04-17-harness-starter-roadmap.md) for the phase-by-phase plan.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Node.js 22 (for tooling that still wants a node binary)

## First run

```sh
gh repo clone <this-repo> harness-starter
cd harness-starter
bun install          # resolves deps + installs git hooks via `prepare`
bun run ci           # lint + typecheck + build + test (target: <30s on a laptop)
```

Once Phase 9 lands:

```sh
cp apps/cli-chat/.env.example apps/cli-chat/.env   # set OPENROUTER_API_KEY
bun run chat
```

## Scripts

| Script            | Runs                                           |
| ----------------- | ---------------------------------------------- |
| `bun run ci`      | `lint && typecheck && build && test`           |
| `bun run lint`    | Biome — check + lint                           |
| `bun run format`  | Biome — write formatting fixes                 |
| `bun run typecheck` | `tsc --noEmit` across all workspace packages |
| `bun run build`   | Build across all workspace packages            |
| `bun test`        | Unit tests via `bun test` (excludes `*.eval.ts`) |
| `bun run chat`    | Run the `apps/cli-chat` demo (Phase 9+)        |
| `bun run server`  | Run the `apps/http-server` demo (Phase 10+)    |
| `bun run eval`    | Invoke the `harness-eval` CLI (Phase 8+)       |

## Repository layout

```
harness-starter/
├── packages/     # @harness/* libraries (seeded in Phases 1-8)
├── apps/         # runnable demos (seeded in Phases 9-10)
├── docs/         # architecture, ADRs, patterns, extending guides
└── .github/      # CI workflow
```

See [`docs/architecture.md`](docs/architecture.md) for the dependency DAG and runtime boundary invariants.

## Conventions

- **Conventional Commits** enforced via Lefthook `commit-msg` (runs commitlint).
- **Biome** is the only linter/formatter (no ESLint/Prettier).
- **Changesets** manage CHANGELOG entries — this repo never publishes to npm.
- **Per-app `.env.example`** — runnable demos ship their own (e.g. `apps/cli-chat/.env.example`). Copy to `.env` and fill in before running.

## Clone-and-own

This starter is meant to be cloned, renamed, and modified — not installed as a dependency. Deleting any of `packages/eval`, `packages/mcp`, `packages/memory-sqlite`, or `apps/http-server` must leave the rest building cleanly. See `docs/upgrading.md` (Phase 11) for the cherry-pick workflow to pull upstream changes.

## Spec and roadmap

- **Architecture spec:** [`docs/superpowers/specs/2026-04-17-harness-starter-design.md`](docs/superpowers/specs/2026-04-17-harness-starter-design.md)
- **Roadmap:** [`docs/superpowers/plans/2026-04-17-harness-starter-roadmap.md`](docs/superpowers/plans/2026-04-17-harness-starter-roadmap.md)

## License

MIT (to be added in a later phase).
