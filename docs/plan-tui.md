# Implementation Plan: Extract `@harness/tui` Package

**Status:** DRAFT — awaiting confirmation
**Date:** 2026-04-19

---

## Overview

Create a `@harness/tui` package with subpath exports for reusable CLI/terminal primitives (spinner, usage footer, SIGINT handler, approval prompt). Zero harness deps — fully standalone. Then update cli-chat to consume it and update the deep-research spec to reference it.

---

## What gets extracted

Four modules, each with its own subpath export so apps import only what they need:

- **`@harness/tui/spinner`** — move from `apps/cli-chat/src/spinner.ts` as-is
- **`@harness/tui/usage`** — extract the inline `(N tokens · Xs · $Y)` format from cli-chat's `index.ts`
- **`@harness/tui/sigint`** — extract the two-press Ctrl+C pattern from cli-chat's `index.ts`
- **`@harness/tui/approval`** — new: readline-based `y/n/edit` prompt for HITL gates (deep-research needs it, generic enough for any app)

## Why a separate package (not in `@harness/agent` or `@harness/core`)

- **Zero harness deps.** `@harness/tui` depends only on `picocolors`. A tiny CLI app can use the spinner without pulling in `core`, `agent`, `zod`, or `ai`.
- **Clone-and-own safe.** Deleting `packages/tui/` doesn't break any other package — only apps that import it.
- **Subpath exports = tree-shakeable.** Bun/bundlers load only the imported module.

---

## Updated DAG

```
core ─┬─> agent ─┬─> tools
      │          ├─> mcp
      │          ├─> memory-sqlite
      │          └─> eval ─> cli
      └─> observability

tui (standalone — no harness deps)
```

`tui` sits outside the harness DAG. No arrows in or out of harness packages.

---

## New package structure

```
packages/tui/
  package.json
  tsconfig.json
  src/
    index.ts          # barrel re-export (convenience)
    spinner.ts        # createSpinner() — moved from cli-chat
    spinner.test.ts
    usage.ts          # formatUsage({ totalTokens, durationMs, cost? }) → string
    usage.test.ts
    sigint.ts         # setupSigint({ onAbort, onExit }) — two-press pattern
    sigint.test.ts
    approval.ts       # promptApproval(question, opts?) → Promise<string>
    approval.test.ts
```

`package.json` exports:

```json
{
  "name": "@harness/tui",
  "exports": {
    ".": "./src/index.ts",
    "./spinner": "./src/spinner.ts",
    "./usage": "./src/usage.ts",
    "./sigint": "./src/sigint.ts",
    "./approval": "./src/approval.ts"
  },
  "dependencies": {
    "picocolors": "1.1.1"
  }
}
```

---

## Module APIs (sketch)

**`spinner.ts`** — identical to current `apps/cli-chat/src/spinner.ts`:

```typescript
export function createSpinner(): { start(): void; stop(): void }
```

**`usage.ts`** — returns unstyled string, caller wraps with `pc.dim()`:

```typescript
export function formatUsage(opts: {
  totalTokens: number;
  durationMs: number;
  cost?: number;
}): string
// → "(42,318 tokens · 28.4s · $0.14)"  or  "(54 tokens · 0.3s)" if no cost
```

**`sigint.ts`** — encapsulates the two-press Ctrl+C pattern:

```typescript
export function setupSigint(opts: {
  isStreaming: () => boolean;
  onAbort: () => void;
  onExit: () => void;
}): void
```

**`approval.ts`** — readline-based approval prompt for HITL interrupts:

```typescript
export function promptApproval(
  question: string,
  opts?: { choices?: string[]; default?: string }
): Promise<string>
// e.g. promptApproval("Approve research plan?", { choices: ["y","n","edit"], default: "n" })
```

---

## Changes to existing code

### `apps/cli-chat/`

- **Delete** `src/spinner.ts`
- **`package.json`**: add `"@harness/tui": "workspace:*"`
- **`src/index.ts`**: replace local spinner/sigint/usage with imports from `@harness/tui`:

```typescript
import { createSpinner } from '@harness/tui/spinner';
import { formatUsage } from '@harness/tui/usage';
import { setupSigint } from '@harness/tui/sigint';
```

The current inline SIGINT handler (~10 lines) and usage footer (~1 line template) get replaced by calls to the tui functions.

### `docs/spec-deep-research.md`

- **D11**: change from "shared CLI UX lives in this app" to "shared CLI UX lives in `@harness/tui`"
- **Section 3 (repo layout)**: remove `src/ui/spinner.ts` and `src/ui/approval.ts` (imported from tui). Keep `src/ui/render.ts` (app-specific stream renderer callback wiring)
- **Section 4 (deps)**: add `@harness/tui` row: "spinner, usage footer, SIGINT handler, HITL approval prompt"

### `.claude/CLAUDE.md`

- Add `@harness/tui` to the package table (standalone, no harness deps)
- Note in DAG that `tui` is outside the main chain

---

## What stays app-local (NOT extracted)

- **`config.ts` / `provider.ts`** — app-specific env schema and model wiring
- **`ui/render.ts`** — app-specific `createStreamRenderer` callback wiring
- **`report/`** — slug generation, atomic file write (domain-specific to deep-research)
- **Agent definitions, graph, guardrails, schemas** — all app-specific
- **`picocolors` usage for coloring prompts/errors** — apps still depend on picocolors directly for their own styling

---

## Testing

- TDD for all four modules in `packages/tui/` (per repo convention for packages)
- `apps/cli-chat` tested manually (per repo convention for apps)
- `bun run ci` must stay green after the refactor

---

## Task list

1. Create `packages/tui/` with package.json, tsconfig.json, subpath exports
2. Move spinner from cli-chat to `@harness/tui/spinner` + add tests
3. Create `@harness/tui/usage` with `formatUsage()` + tests
4. Create `@harness/tui/sigint` with `setupSigint()` + tests
5. Create `@harness/tui/approval` with `promptApproval()` + tests
6. Create barrel `index.ts` re-exporting all modules
7. Refactor cli-chat to import from `@harness/tui` instead of local copies
8. Update deep-research spec D11, section 3 layout, section 4 deps
9. Update CLAUDE.md DAG and package table to include `@harness/tui`
10. Run `bun run ci` — lint + typecheck + build + test all green
