---
"harness-starter": minor
---

Complete Mastra framework migration — all legacy harness packages removed.

- **New packages:** `@harness/tools` (Mastra createTool), `@harness/agents` (Mastra Agent), `@harness/workflows` (Mastra createWorkflow with HITL suspend/resume).
- **Deep research** runs as a Mastra workflow with plan → approve (suspend) → research → write+fact-check steps.
- **Simple chat** uses a Mastra Agent with memory.
- **Deleted legacy packages:** `@harness/agent`, `@harness/core`, `@harness/hitl`, `@harness/llm-adapter`, `@harness/mcp`, `@harness/memory-sqlite`, `@harness/observability`, `@harness/session-events`, `@harness/session-store`, `@harness/eval`, `@harness/cli`, `@harness/tui`.
- **Deleted apps:** `apps/cli-chat`.
- **Inlined into web-studio:** session store, approval store, LLM model catalog, UI event types.
- **Mastra Studio** available via `bun run mastra:dev`.
