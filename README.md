# Harness Starter

TypeScript-first, clone-and-own starter for building agentic AI systems. Event-sourced run execution, pluggable capabilities, and HTTP APIs. Powered by [Mastra](https://mastra.ai) framework primitives, feature-folder monorepo on Bun workspaces.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Node.js 22 (for tooling that still wants a node binary)

## First run

```sh
gh repo clone <this-repo> harness-starter
cd harness-starter
bun install
bun run ci           # lint + typecheck + build + test
```

## Running

```sh
bun run web          # API (:3000) + Console UI (:5173) in parallel
bun run mastra:dev   # Mastra Studio on :4111 (agents, workflows, traces)
```

The API server runs on port 3000 with in-memory stores (data resets on restart). The Console UI proxies API calls to port 3000.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Start a new run (`{capabilityId, input, settings?}`) |
| `GET` | `/runs/:id` | Get run status |
| `GET` | `/runs/:id/events` | SSE stream of `SessionEvent`s |
| `POST` | `/runs/:id/cancel` | Cancel a run |
| `POST` | `/runs/:id/approve` | Approve pending HITL decision |
| `POST` | `/runs/:id/reject` | Reject pending HITL decision |
| `GET` | `/capabilities` | List available capabilities |
| `GET` | `/capabilities/:id` | Capability detail + input/settings schemas |
| `GET` | `/settings` | Get settings (global or per-capability) |
| `PUT` | `/settings` | Update settings |
| `GET` | `/conversations` | List conversations |
| `GET` | `/conversations/:id/messages` | Get conversation messages |
| `GET` | `/models` | List available AI models |
| `GET` | `/health` | Health check |
| `GET` | `/openapi.json` | OpenAPI 3.1 spec |
| `GET` | `/docs` | Scalar API docs |

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
| `bun run api`       | API server only (Hono on :3000)                |
| `bun run console`   | Console UI only (Vite on :5173)                |
| `bun run mastra:dev`| Mastra Studio for agent/workflow inspection     |
| `bun run mastra:build` | Mastra production build                     |

## Repository layout

```
harness-starter/
├── packages/
│   ├── core/         # Domain, feature folders, storage, providers, observability
│   ├── capabilities/ # Capability definitions (simple-chat, deep-research) + buildStudioConfig
│   ├── http/         # Hono routes, middleware, OpenAPI spec, public DTO types
│   ├── agents/       # Mastra Agent definitions
│   ├── tools/        # Mastra Tool definitions
│   └── workflows/    # Mastra Workflow definitions
├── apps/
│   ├── api/          # Hono API server (composition root — wires packages together)
│   └── console/      # React SPA (Vite + TanStack Query, proxies to API)
├── mastra.config.ts  # Root Mastra config (uses buildStudioConfig from capabilities)
├── docs/             # Architecture plans
└── .github/          # CI workflow
```

## Architecture

The system uses feature-folder organization with event-sourced run execution:

- **Core** (`@harness/core`) contains domain types (`Run`, `SessionEvent`, `CapabilityDefinition`), feature folders (`runs/`, `conversations/`, `settings/`, `capabilities/`), and infrastructure (`storage/`, `providers/`, `observability/`, `time/`, `memory/`).
- **Capabilities** (`@harness/capabilities`) define concrete agent/workflow capabilities. Adding a capability here auto-registers it in both the HTTP API and Mastra Studio.
- **HTTP** (`@harness/http`) exposes REST + SSE endpoints via Hono with typed DTOs.
- Storage types are defined inline next to their default implementation. Swap in-memory to Postgres by adding another class and choosing at wire time.

## Conventions

- **Conventional Commits** enforced via Lefthook `commit-msg` (runs commitlint).
- **Biome** is the only linter/formatter (no ESLint/Prettier).
- **Changesets** manage CHANGELOG entries — this repo never publishes to npm.
- **TDD enforced** for `packages/*`. Pragmatic / tests-after for `apps/*`.

## Clone-and-own

This starter is meant to be cloned, renamed, and modified — not installed as a dependency. Deleting any of `packages/tools`, `packages/agents`, `packages/workflows`, `packages/capabilities`, or any `apps/*` must leave the rest building cleanly.

## License

MIT (to be added in a later phase).
