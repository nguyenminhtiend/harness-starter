---
description: Break work into small verifiable tasks with acceptance criteria and dependency ordering
---

Invoke the agent-skills:planning-and-task-breakdown skill.

Read the existing spec (`docs/spec.md`) and the relevant codebase sections. Then:

1. Enter plan mode — read only, no code changes
2. Identify the dependency graph between packages (respect the DAG in CLAUDE.md)
3. Slice work vertically (one complete path per task, not horizontal layers)
4. Write tasks with acceptance criteria and verification steps (`bun test`, `bun run typecheck`, `bun run build`)
5. Add checkpoints between phases
6. Present the plan for human review

Save the plan to `docs/plan.md`.
