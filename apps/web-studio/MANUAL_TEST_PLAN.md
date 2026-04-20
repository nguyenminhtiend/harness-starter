# Web Studio — Manual Test Plan

## Table of Contents

- [Part 1: Prerequisites](#part-1-prerequisites)
- [Part 2: Manual Test Plan](#part-2-manual-test-plan)
- [Part 3: Automated checks](#part-3-automated-checks)

---

## Part 1: Prerequisites

### Environment Variables

| Variable | Required | Notes |
|----------|----------|--------|
| `OPENROUTER_API_KEY` | **yes** for live runs | Used only on the server; never exposed to the browser |
| `BRAVE_API_KEY` | no | Enables Brave Search MCP when configured in tool settings |
| `HOST` | no | Defaults to `127.0.0.1` |
| `PORT` | no | API server defaults to `3000` |
| `DATA_DIR` | no | SQLite app data defaults to `~/.web-studio` |

### Install

```bash
cd /path/to/harness-starter
bun install
```

### Verify CI

```bash
bun run ci
```

---

## Part 2: Manual Test Plan

### Test 1: Startup (dev)

**Goal:** API, UI, and SQLite data directory come up cleanly.

```bash
export OPENROUTER_API_KEY="sk-or-..."
bun run web
```

**Expected:**

- Server log shows it is listening on `http://127.0.0.1:3000` (or your `HOST`/`PORT`).
- Vite serves the UI (default Vite port, often `5173` — follow the URL printed in the terminal).
- Opening the UI loads without a blank error screen.

**Verify:**

- `GET http://127.0.0.1:3000/api/health` returns `{"status":"ok"}`.

---

### Test 2: Settings panel — load and merge

**Goal:** Global defaults merge with per-tool overrides; API keys are masked.

**Steps:**

1. Open the app in the browser.
2. Open **Settings** (or the settings surface for the active tool).
3. Change **global** default model (or budget) and save.
4. Override **tool-specific** model for Deep Research and save.
5. Reload the page.

**Expected:**

- After reload, global and tool values match what you saved.
- Brave API key (if set) appears as “set” / masked, never the raw string in the UI or in `GET /api/settings` JSON from DevTools.

---

### Test 3: Prompt persistence

**Goal:** Custom planner / writer / fact-checker prompts persist across reloads.

**Steps:**

1. Set a distinctive **planner** prompt, save.
2. Reload the app and open settings again.

**Expected:**

- The custom prompt text is still present after reload.

---

### Test 4: Run lifecycle — happy path (no HITL)

**Goal:** Create a run, observe completion, see metadata.

**Preconditions:** Turn **HITL** off for Deep Research in settings (or use defaults with HITL disabled).

**Steps:**

1. Enter a small research question (for example: “What are CRDTs in two sentences?”).
2. Start the run.
3. Wait until the run shows **completed** (or equivalent finished state in the UI).

**Expected:**

- A new run appears in **history** with status progressing to completed.
- Final output or report area reflects a finished research result (length and content vary by model).

---

### Test 5: SSE streaming

**Goal:** Events stream live over Server-Sent Events without requiring a full page reload.

**Steps:**

1. Start a run on a question that takes noticeable time (not a one-token answer).
2. Watch the live event / log / progress UI during the run.

**Expected:**

- Tokens, phases, or tool activity update during the run (not only after completion).
- Network tab shows `GET /api/runs/<id>/events` with `text/event-stream` (or similar) and incremental data.

---

### Test 6: HITL plan approval

**Goal:** Run pauses for plan approval; approve continues; reject cancels.

**Preconditions:** Enable **HITL** for Deep Research in settings.

**Steps:**

1. Start a run.
2. When the **plan approval** modal appears, inspect the plan.
3. **Reject** — confirm the run ends as cancelled / rejected with a clear message.
4. Start another run; **Approve** — confirm research continues.

**Expected:**

- Approve path: research proceeds after approval.
- Reject path: run stops without completing a full report; UI shows an error or cancelled state consistent with rejection.

---

### Test 7: History and replay

**Goal:** Past runs appear in history; completed run events can be replayed.

**Steps:**

1. Complete at least one run (from Test 4 or 6).
2. Open **history** and select a completed run.
3. If the UI supports replay or viewing stored events, open that view.

**Expected:**

- Completed runs are listed with question text and status.
- Selecting a run shows stored progress / events consistent with the original run (ordering preserved).

---

### Test 8: Cancel

**Goal:** In-flight run can be cancelled from the UI.

**Steps:**

1. Start a longer question (medium depth or similar).
2. Click **Cancel** (or stop) while the run is still active.

**Expected:**

- Run transitions to **cancelled** (or failed-with-cancel semantics).
- SSE stream ends cleanly; UI does not hang indefinitely.

---

### Test 9: Error states

**Goal:** Missing API key and bad inputs fail predictably.

**Cases:**

1. **Missing `OPENROUTER_API_KEY`:** stop exporting the key, restart `bun run web`, start a run.

   **Expected:** Clear error in UI or run failure (not a silent hang).

2. **Empty question:** submit without text if the UI allows it.

   **Expected:** Validation prevents the run or the API returns `400`.

3. **Invalid settings payload** (optional, via `curl`):

   ```bash
   curl -s -X PUT http://127.0.0.1:3000/api/settings \
     -H 'Content-Type: application/json' \
     -d '{"scope":"","settings":{}}'
   ```

   **Expected:** HTTP `400` with an error body.

---

### Test 10: Security — bind address

**Goal:** Server is local-only by default.

**Expected:**

- Default `HOST` is `127.0.0.1`, not `0.0.0.0`, so the API is not exposed on all interfaces unless you explicitly change it.

---

## Part 3: Automated checks

### Unit and route tests

```bash
bun test apps/web-studio/
```

### Full monorepo CI

```bash
bun run ci
```

**Expected:** Lint, typecheck, build, and tests all pass; `apps/web-studio` is included via workspace filters.
