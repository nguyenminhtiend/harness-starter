# Harness Starter

TypeScript-first, clone-and-own starter for building agentic AI systems. Powered by [Mastra](https://mastra.ai) framework, layered modular monorepo on Bun workspaces.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Node.js 22 (for tooling that still wants a node binary)

## First run

```sh
gh repo clone <this-repo> harness-starter
cd harness-starter
cp apps/api/.env.example apps/api/.env  # set API keys
bun install
bun run ci           # lint + typecheck + build + test
```

## Running

```sh
bun run web          # API (:3000) + Console UI (:5173) in parallel
bun run mastra:dev   # Mastra Studio on :4111 (agents, workflows, traces)
```

## Scripts

| Script              | Runs                                           |
| ------------------- | ---------------------------------------------- |
| `bun run ci`        | `lint && typecheck && build && test`           |
| `bun run lint`      | Biome — check + lint                           |
| `bun run format`    | Biome — write formatting fixes                 |
| `bun run typecheck` | `tsc --noEmit` across all workspace packages   |
| `bun run build`     | Build across all workspace packages            |
| `bun test`          | Unit tests via `bun test` (excludes `*.eval.ts`) |
| `bun run web`       | Run API + Console (Hono + Vite) in parallel    |
| `bun run mastra:dev`| Mastra Studio for agent/workflow inspection     |
| `bun run mastra:build` | Mastra production build                     |

## Repository layout

```
harness-starter/
├── packages/
│   ├── core/         # Domain model, ports, use cases
│   ├── http/         # Hono routes, middleware, public DTOs
│   ├── adapters/     # Port implementations (in-memory, Mastra, Pino)
│   ├── capabilities/ # Capability definitions
│   ├── agents/       # Mastra Agent definitions
│   ├── tools/        # Mastra Tool definitions
│   └── workflows/    # Mastra Workflow definitions
├── apps/
│   ├── api/          # Hono API server (composition root)
│   └── console/      # React SPA (Vite dev server, proxies to API)
├── mastra.config.ts  # Root Mastra config (agents, workflows, storage)
├── docs/             # Specs and migration plans
└── .github/          # CI workflow
```

## Conventions

- **Conventional Commits** enforced via Lefthook `commit-msg` (runs commitlint).
- **Biome** is the only linter/formatter (no ESLint/Prettier).
- **Changesets** manage CHANGELOG entries — this repo never publishes to npm.
- **Per-app `.env.example`** — copy to `.env` and fill in API keys before running.

## Clone-and-own

This starter is meant to be cloned, renamed, and modified — not installed as a dependency. Deleting any of `packages/tools`, `packages/agents`, `packages/workflows`, or any `apps/*` must leave the rest building cleanly.

## License

MIT (to be added in a later phase).
