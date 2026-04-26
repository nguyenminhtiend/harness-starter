# Plan — `apps/studio` for Mastra Studio + Editor

Status: proposed, awaiting human review.

## Goal

Stand up a dedicated `apps/studio` workspace that hosts Mastra Studio and Mastra Editor, retarget root scripts at it, slim runtime apps, and enforce per-app import boundaries via Biome — without touching agent/workflow/tool code in `packages/mastra`.

## Locked decisions

| ID | Decision |
|----|----------|
| A  | Composition lives at `apps/studio/src/mastra/index.ts` (Mastra convention; no `--config` flag). |
| B  | Keep package name `@harness/mastra`. No rename. |
| C  | Editor + Studio share the existing LibSQL store (`file:./.mastra/mastra.db`). |
| D  | Add Biome `noRestrictedImports` per-app rules in this same change. |

## Constraints

- Preserve **invariant #9** (clone-and-own): deleting `packages/mastra/` must still leave `core + http + bootstrap` green. After this change, deleting `packages/mastra/` *and* `apps/studio/` must leave `core + http + bootstrap + apps/api + apps/cli + apps/console` green.
- Preserve existing module-boundary rules in `biome.json` (`packages/core`, `packages/http`, `apps/console`). Extend, don't replace.
- No new tests required (this is `apps/*` work; TDD-for-packages does not apply).
- No new abstractions, no rename, no behavior changes inside `packages/mastra`.

## Dependency graph after the change

```
@harness/core ─→ @harness/http
       ↑
@harness/mastra ──────────┐
       ↑                  │
@harness/bootstrap        │
       ↑                  │
       │                  │
apps/api ─→ @harness/http │
apps/cli                  │
apps/console (http types) │
apps/studio ──────────────┘   (no http, no bootstrap, no core)
```

`apps/studio` is a sibling of `apps/api` — both consume `@harness/mastra` factories, each builds its own `Mastra` instance.

## Phasing & checkpoints

Five phases. Each ends in a checkpoint where the workspace must be green via a defined verification command. Phases are sequential; tasks *within* a phase that are marked `parallelizable` may run concurrently.

---

### Phase 1 — Stand up `apps/studio` (no removals yet)

Goal: new app exists, boots Studio, leaves the rest of the repo unchanged. Both the root `mastra.config.ts` *and* the new app coexist temporarily so we can compare side-by-side.

**Task 1.1 — Create `apps/studio/package.json`**
- Add workspace package `@harness/studio`, `private: true`, `type: "module"`.
- `dependencies`: `@harness/mastra` (workspace), `@mastra/core`, `@mastra/editor` (new), `@mastra/libsql`, `@mastra/loggers`, `@mastra/memory`, `mastra` (CLI; runtime dep so `mastra start` works in prod).
- `devDependencies`: `@types/bun`, `typescript`.
- `scripts`: `dev: "mastra dev"`, `build: "mastra build"`, `start: "mastra start"`, `typecheck: "tsc --noEmit"`.
- **Acceptance:** `bun install` resolves; lockfile updates; `apps/studio` appears in `bun pm ls` workspace list.

**Task 1.2 — Create `apps/studio/tsconfig.json`** *(parallelizable with 1.1)*
- Extends `tsconfig.base.json` like other apps; `include` covers `src/**/*.ts`.
- **Acceptance:** `bun run --filter @harness/studio typecheck` exits 0.

**Task 1.3 — Create `apps/studio/src/mastra/index.ts`**
- Move composition contents from current root `mastra.config.ts`:
  - Import factories from `@harness/mastra`.
  - Construct `LibSQLStore` with `MASTRA_DB_URL ?? 'file:./.mastra/mastra.db'`.
  - Construct `PinoLogger`.
  - Add `editor: new MastraEditor()` from `@mastra/editor`.
  - Export `mastra`.
- Keep existing root `mastra.config.ts` *unchanged* in this phase.
- **Acceptance:** typecheck passes; file exports a single `mastra` constant typed as `Mastra`.

**Task 1.4 — Verify Studio boots from the new location**
- Run `bun run --filter @harness/studio dev`. Confirm:
  - Studio loads at `http://localhost:4111`.
  - `simpleChatAgent` and `deepResearch` render.
  - The Editor tab is visible inside an agent detail page.
  - LibSQL file is created at `./.mastra/mastra.db` (same path Studio used before — shared store).
- Stop Studio.
- **Acceptance:** human-verified screenshots / notes recorded; Studio renders agents + Editor tab.

**Checkpoint 1:** `bun run ci` green. Both old root config and new `apps/studio` exist; nothing broken; Studio is reachable from the new path.

---

### Phase 2 — Cut over root scripts and remove the legacy config

Goal: only one source of truth for Studio composition.

**Task 2.1 — Retarget root `package.json` scripts**
- Replace `studio:dev: "bunx mastra dev --config mastra.config.ts"` → `"bun run --filter @harness/studio dev"`.
- Replace `studio:build` similarly with `--filter @harness/studio build`.
- **Acceptance:** `bun run studio:dev` boots Studio at :4111 (same as 1.4).

**Task 2.2 — Delete root `mastra.config.ts`**
- Remove the file.
- **Acceptance:** `ls mastra.config.ts` fails; `bun run studio:dev` still works (proves Mastra CLI auto-discovers `apps/studio/src/mastra/index.ts`).

**Task 2.3 — Slim root `package.json` deps** *(parallelizable with 2.2)*
- Remove root-level deps that only the deleted root config needed and that no other root script uses: `@mastra/core`, `@mastra/libsql`, `@mastra/loggers`, `@mastra/memory` (each now lives in the consumer that needs it: `packages/mastra`, `apps/studio`).
- Move `mastra` out of root `devDependencies` — it now lives in `apps/studio` deps.
- Keep `ai` and `@ai-sdk/openai` only if they are still consumed by root scripts; otherwise drop them too. Verify by grep.
- Keep root devDeps that are truly workspace-wide: `@biomejs/biome`, `@changesets/cli`, `@commitlint/*`, `lefthook`, `typescript`.
- **Acceptance:** `bun install --frozen-lockfile` (after `bun install` updates lock) succeeds; `bun run ci` green; `apps/api` and `apps/cli` still build (deps resolve transitively through their own package.json).

**Checkpoint 2:** `bun run ci` green. Single source of truth for Studio composition is `apps/studio/src/mastra/index.ts`. Root carries no Mastra runtime deps.

---

### Phase 3 — Confirm `apps/api` is lean

Goal: `apps/api` carries no dev-only Mastra deps. (Inspection of current `apps/api/package.json` shows it is already lean — only `@harness/bootstrap`, `@harness/http`, `@harness/mastra`. This phase is a verification phase.)

**Task 3.1 — Audit `apps/api` runtime imports**
- `grep -r "@mastra/editor\|from 'mastra'" apps/api/` → must be empty.
- `grep -r "@mastra/" apps/api/` → must be empty (Mastra access goes through `@harness/mastra` and `@harness/bootstrap`).
- **Acceptance:** both greps empty.

**Task 3.2 — Confirm `apps/api/package.json` lists only runtime deps**
- Required: `@harness/bootstrap`, `@harness/http`, `@harness/mastra`.
- Forbidden: `@mastra/editor`, `mastra` (CLI), any direct `@mastra/*` pkg.
- **Acceptance:** package.json matches; no changes needed (already correct), or any forbidden entry removed.

**Task 3.3 — Confirm `apps/cli/package.json` lean** *(parallelizable with 3.2)*
- Same forbidden list applies. Current state already conforms.
- **Acceptance:** unchanged or trimmed.

**Checkpoint 3:** `bun run ci` green; `apps/api` has zero Mastra-CLI / Editor exposure in its dep tree.

---

### Phase 4 — Per-app import boundaries in Biome

Goal: make the boundary mechanically enforceable so future drift is caught at lint time.

**Task 4.1 — Add `apps/api/**` `noRestrictedImports` override**
- Forbidden paths:
  - `@mastra/editor` — "Editor is dev-only; mount in apps/studio."
  - `mastra` — "Mastra CLI is dev-only."
- Forbidden patterns: `@mastra/editor/*`.
- **Acceptance:** `bun run lint` green. Inserting `import x from '@mastra/editor'` into `apps/api/src/index.ts` produces an error (manual probe, then revert).

**Task 4.2 — Add `apps/cli/**` `noRestrictedImports` override** *(parallelizable with 4.1)*
- Same forbidden list as 4.1.
- **Acceptance:** lint green; same manual probe.

**Task 4.3 — Add `apps/studio/**` `noRestrictedImports` override**
- Forbidden paths:
  - `@harness/http` — "studio must not import http (DAG violation)."
  - `@harness/bootstrap` — "studio must not import bootstrap; build its own Mastra instance."
  - `@harness/core` — "studio uses Mastra primitives directly; core's Run aggregate is a runtime concern."
- Forbidden patterns: `@harness/http/*`, `@harness/bootstrap/*`, `@harness/core/*`.
- **Acceptance:** lint green; manual probe of an offending import errors.

**Checkpoint 4:** `bun run ci` green. Each app's allowed import surface is encoded in `biome.json`.

---

### Phase 5 — Documentation

Goal: CLAUDE.md and README reflect the new layout so future readers (and Claude Code) don't drift.

**Task 5.1 — Update CLAUDE.md package DAG diagram**
- Add `apps/studio` as a sibling of `apps/api`/`apps/cli`/`apps/console`.
- Add a note that `apps/studio` depends only on `@harness/mastra`, not on `core`/`http`/`bootstrap`.

**Task 5.2 — Update CLAUDE.md commands table** *(parallelizable with 5.1)*
- `bun run studio:dev` now proxies into `apps/studio`. Note the canonical entry path `apps/studio/src/mastra/index.ts`.
- Add: Editor lives inside Studio (Agents tab → an agent → Editor tab). Same LibSQL DB as Studio traces.

**Task 5.3 — Add a one-liner to "Architecture — feature folders"**
- Note that Studio composition is an app, mirroring `apps/api`, both consume `@harness/mastra` factories with their own `Mastra` instance.

**Task 5.4 — Optional README touch-up** *(skip if README already neutral)*
- If the existing README references the old root `mastra.config.ts` path, update.

**Checkpoint 5 — final acceptance:** all of the following green:
- `bun run ci` exits 0 with no warnings beyond the existing baseline.
- `bun run studio:dev` boots Studio at :4111; `simpleChatAgent` chat works; `deepResearch` workflow renders; an Editor tab is visible on an agent detail page.
- `bun run api` boots `apps/api` at :3000; `/health` returns 200; `/runs` accepts a request; **dependency tree audit:** `bun pm ls --filter @harness/example-api | grep -E '@mastra/editor|^mastra@'` returns nothing.
- Invariant probe (manual, do not commit): `mv packages/mastra /tmp/.mastra-bak && mv apps/studio /tmp/.studio-bak && bun run --filter @harness/core typecheck && bun run --filter @harness/http typecheck && bun run --filter @harness/bootstrap typecheck` all exit 0; then restore. (Only run if comfortable; the existing CI never deletes these but the invariant must hold.)

---

## Verification commands (reference)

| When | Command |
|------|---------|
| After every task | `bun run lint` |
| After Phase boundary | `bun run ci` |
| Studio smoke | `bun run studio:dev` |
| API smoke | `bun run api` |
| Workspace audit | `bun pm ls` |
| Dep-tree audit (api) | `bun pm ls --filter @harness/example-api` |

## Risks & open questions

1. **`@mastra/editor` version pinning.** The package version is not yet known — Task 1.1 needs to discover the latest compatible release with `@mastra/core@1.27.0`. If incompatible, fall back to deferring Editor to a follow-up PR (still ship the `apps/studio` move).
2. **`mastra` CLI as runtime dep.** Listing `mastra` in `apps/studio/dependencies` (vs `devDependencies`) is intentional so `mastra start` works in a prod deploy of Studio. If you never deploy Studio, demote to `devDependencies`.
3. **Auto-discovery vs `--config`.** Mastra CLI auto-discovers `src/mastra/index.ts` only when run from the package root. The root `studio:*` scripts therefore must shell into the workspace via `bun run --filter`, which they do. If a future contributor reverts to running `mastra dev` from the repo root, it will fail to discover the new path. The doc update in Task 5.2 calls this out.
4. **Workspace hoisting.** Removing `@mastra/*` packages from the root `package.json` (Task 2.3) is safe only because each consumer (`packages/mastra`, `apps/studio`) declares them. Run `bun install` and `bun run ci` immediately after to confirm hoisting still resolves transitively.
5. **Editor + tested prompts.** Editor lets non-devs publish prompt overrides. Today, agent prompts live in code and are tested via `mockModel()`. Out of scope for this plan, but flagged: once anyone publishes a draft via Editor, the runtime API needs a story for whether/how to consume it. Track as a follow-up doc.

## Out of scope (explicitly)

- Renaming `packages/mastra` → anything else.
- Splitting Editor storage to a separate DB.
- Wiring published Editor prompts back into `apps/api`.
- New tests, new agents, new workflows, refactoring inside `packages/mastra`.
- Production deploy story for Studio.
