---
"harness-starter": minor
---

Migrate web-studio from custom harness agent/graph to Mastra framework.

- **New packages:** `@harness/tools` (Mastra createTool), `@harness/agents` (Mastra Agent), `@harness/workflows` (Mastra createWorkflow with HITL suspend/resume).
- **Deep research** now runs as a Mastra workflow with plan → approve (suspend) → research → write+fact-check steps.
- **Simple chat** now uses a Mastra Agent with memory.
- **Deleted:** `apps/cli-chat`, `packages/tui`, `packages/eval`, `packages/cli`, old `packages/tools` (harness version).
- **Renamed:** `packages/tools-mastra` → `packages/tools`.
- **Mastra Studio** available via `bun run mastra:dev`.
