# Harness Starter

TypeScript-first, clone-and-own starter for building agentic AI systems. Powered by [Mastra](https://mastra.ai) framework, layered modular monorepo on Bun workspaces.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Node.js 22 (for tooling that still wants a node binary)

## First run

```sh
gh repo clone <this-repo> harness-starter
cd harness-starter
cp apps/web-studio/.env.example apps/web-studio/.env  # set API keys
bun install
bun run ci           # lint + typecheck + build + test
```

## Running

```sh
bun run web          # web-studio (Vite UI + Hono API on :3000)
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
| `bun run web`       | Run `apps/web-studio` (Vite UI + Hono API)     |
| `bun run mastra:dev`| Mastra Studio for agent/workflow inspection     |
| `bun run mastra:build` | Mastra production build                     |

## Repository layout

```
harness-starter/
├── packages/
│   ├── agents/       # Mastra Agent definitions (simpleChatAgent)
│   ├── tools/        # Mastra Tool definitions (calculator, get-time, fs, fetch)
│   └── workflows/    # Mastra Workflow definitions (deepResearchWorkflow)
├── apps/
│   ├── web-studio/   # Production web UI (Hono + React + Vite)
│   ├── server/       # HTTP server (placeholder)
│   └── web/          # Web client (placeholder)
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
