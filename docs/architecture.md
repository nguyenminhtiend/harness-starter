# Architecture

> **Stub.** A trimmed, contributor-facing version of the architecture spec lands in Phase 11. For now, the canonical source is the full spec:
>
> 📖 [`docs/superpowers/specs/2026-04-17-harness-starter-design.md`](superpowers/specs/2026-04-17-harness-starter-design.md)

## Dependency DAG

```
core ─┬─> agent ─┬─> memory-sqlite
      │          ├─> tools
      │          ├─> mcp
      │          ├─> observability
      │          ├─> eval ─> cli
      │          └─> apps/*
      └─> (apps/*)
```

Enforced by TypeScript `references` and a Biome `noRestrictedImports` rule (lands in Phase 1). Do not add a cross-package import that violates this DAG.

## Runtime boundary

`@harness/core` uses only Web-standard APIs (`fetch`, `ReadableStream`, `AbortSignal`). Node/Bun-only functionality (SQLite, filesystem, OpenTelemetry exporters) lives in sibling packages — never in `core`.

## Shape invariants

See [CLAUDE.md](../.claude/CLAUDE.md#shape-invariants-non-negotiable) for the non-negotiable invariants (stream-first, plain interfaces, composition over primitives, etc.).

## Phased delivery

Implementation proceeds phase by phase per the [roadmap](superpowers/plans/2026-04-17-harness-starter-roadmap.md). See [`adr/`](adr/) for load-bearing architectural decisions.
