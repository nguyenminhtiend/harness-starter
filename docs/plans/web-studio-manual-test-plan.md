# Web Studio — Full Setup & Manual Test Plan

> **Date:** 2026-04-20
> **App:** `apps/web-studio` — local-first web UI for running harness agent tools (Deep Research)
> **Stack:** Hono server (Bun) + React 19 / Vite 6 frontend, SSE streaming, SQLite persistence

---

## Part 1: Environment Setup

### 1.1 Prerequisites

| Requirement | Minimum | Check command |
|---|---|---|
| Bun | ≥ 1.3 | `bun --version` |
| Node.js | ≥ 22 (for Vite) | `node --version` |
| Git | any | `git --version` |
| OS | macOS / Linux (Windows untested) | — |

### 1.2 Environment Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | **yes** for live runs | — | Server-side only; never sent to browser |
| `BRAVE_API_KEY` | no | — | Enables Brave Search in Deep Research tool settings |
| `HOST` | no | `127.0.0.1` | Bind address; should stay `127.0.0.1` for security |
| `PORT` | no | `3000` | API server port |
| `DATA_DIR` | no | `~/.web-studio` | SQLite DB location (`web-studio.db`) |

### 1.3 Install & Verify

```bash
# 1. Clone and install
cd /path/to/harness-starter
bun install

# 2. Verify all packages pass CI (lint + typecheck + build + test)
bun run ci

# 3. Run web-studio unit tests specifically
bun test apps/web-studio/
```

**Expected:**
- `bun install` completes without errors.
- `bun run ci` is green — all lint, typecheck, build, test pass.
- `bun test apps/web-studio/` — all persistence, routes, runner, settings tests pass.

### 1.4 Start Dev Server

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
bun run web
```

This runs `apps/web-studio/scripts/dev.ts` which spawns:
1. **Hono API server** on `http://127.0.0.1:3000` (hot-reloaded via `bun --hot`)
2. **Vite dev server** on `http://localhost:5173` (with `/api` proxied to `:3000`)

**Expected:**
- Terminal shows `[server] listening on http://127.0.0.1:3000` (or configured HOST:PORT).
- Vite outputs its dev URL (typically `http://localhost:5173`).
- Both processes start without crash.

### 1.5 Health Check

```bash
curl -s http://127.0.0.1:3000/api/health | jq
```

**Expected:**
```json
{ "status": "ok" }
```

---

## Part 2: User Cases & Manual Tests

---

### UC-01: First Load — App Shell Renders

**Goal:** Verify the UI loads without errors and shows the three-panel layout.

**Steps:**
1. Open `http://localhost:5173` in Chrome/Firefox.

**Expected:**
- Left sidebar renders with "web-studio" title, tool picker (Deep Research selected), and empty history section.
- Center panel shows the RunForm: query textarea, model select, Run/Stop buttons.
- Top bar shows status badge ("idle"), gear icon for settings.
- No console errors in DevTools.
- "No active run" placeholder visible in the center area.

---

### UC-02: Settings — Load Global Defaults

**Goal:** Verify settings panel loads with correct defaults.

**Steps:**
1. Click the ⚙ gear icon in the top bar.
2. Inspect the settings panel that appears.

**Expected:**
- Settings panel replaces the center content.
- Shows tabs/sections for tool settings.
- Global defaults visible:
  - `defaultModel` = `openrouter/free`
  - `budgetUsd` = `0.5`
  - `budgetTokens` = `200000`
  - `concurrency` = `3`
- Deep Research tool fields rendered from its Zod schema: `depth` (select: shallow/medium/deep), `hitl` (toggle), `ephemeral` (toggle), etc.
- Fields show "inherited" badge when using global default values.
- `braveApiKey` shown as masked status (`set` / `not set`), never the raw key.
- Pressing Escape returns to the run view.

**API verification:**
```bash
curl -s http://127.0.0.1:3000/api/settings | jq
```
Response should contain `global` + `tools["deep-research"]` with inherited markers. No raw API key values in the `braveApiKey` field — only `{ "set": false }` or `{ "set": true }`.

---

### UC-03: Settings — Persist Global Change

**Goal:** Global settings persist across page reloads.

**Steps:**
1. Open Settings.
2. Change the default model to a different value (e.g., `google/gemini-flash-1.5`).
3. Change `budgetUsd` to `1.0`.
4. Wait for auto-save (debounced).
5. Hard-reload the page (`Cmd+Shift+R`).
6. Open Settings again.

**Expected:**
- After reload, the model field shows `google/gemini-flash-1.5`.
- Budget shows `1.0`.
- The values survive because they're persisted to SQLite via `PUT /api/settings`.

**API verification:**
```bash
# Save
curl -s -X PUT http://127.0.0.1:3000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"scope":"global","settings":{"defaultModel":"google/gemini-flash-1.5","budgetUsd":1.0}}'

# Read back
curl -s http://127.0.0.1:3000/api/settings | jq '.global'
```

---

### UC-04: Settings — Per-Tool Override

**Goal:** Tool-level overrides win over global defaults.

**Steps:**
1. Set global model to `openrouter/free`.
2. Open Deep Research tool settings.
3. Override model to `anthropic/claude-3.5-sonnet`.
4. Save. Reload.

**Expected:**
- Global model still shows `openrouter/free`.
- Deep Research model shows `anthropic/claude-3.5-sonnet`.
- The `inheritedFromGlobal.model` should be `false` for deep-research.
- When a run is started, it uses the per-tool model (`anthropic/claude-3.5-sonnet`).

**API verification:**
```bash
curl -s -X PUT http://127.0.0.1:3000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"scope":"deep-research","settings":{"model":"anthropic/claude-3.5-sonnet"}}'

curl -s http://127.0.0.1:3000/api/settings | jq '.tools["deep-research"]'
```
`inheritedFromGlobal.model` should be `false`.

---

### UC-05: Settings — Prompt Persistence

**Goal:** Custom agent prompts persist and restore.

**Steps:**
1. Open Settings → Prompts tab for Deep Research.
2. Set a distinctive planner prompt: `"You are a meticulous research planner. Always include 5 subquestions."`.
3. Save. Reload page. Open settings.

**Expected:**
- The custom planner prompt text is still present.
- "Restore default" button is available next to the prompt textarea.
- Clicking "Restore default" clears the override and shows the built-in prompt.

**API verification:**
```bash
curl -s http://127.0.0.1:3000/api/settings | jq '.tools["deep-research"].values.plannerPrompt'
```

---

### UC-06: Settings — API Key Masking

**Goal:** API keys are never exposed to the browser.

**Steps:**
1. Open Settings.
2. Set a Brave API key value (e.g., paste `BSA12345...`).
3. Save.
4. Open DevTools Network tab.
5. Reload and watch the `GET /api/settings` response.

**Expected:**
- The response body for `braveApiKey` shows `{ "set": true }`, NOT the raw key.
- The UI shows "set" / "not set" indicator, never the actual key text.
- Even with malicious XSS, the key cannot be extracted from the API response.

---

### UC-07: Settings — Invalid Payload Rejected

**Goal:** Bad settings payloads return 400.

**Steps:**
```bash
curl -s -X PUT http://127.0.0.1:3000/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"scope":"","settings":{}}'
```

**Expected:**
- HTTP `400` response with an error body.
- Server does not crash.

---

### UC-08: Tool Registry — List Available Tools

**Goal:** The tools endpoint returns the registry.

**Steps:**
```bash
curl -s http://127.0.0.1:3000/api/tools | jq
```

**Expected:**
```json
{
  "tools": [
    {
      "id": "deep-research",
      "title": "Deep Research",
      "description": "Multi-step research agent: ...",
      "settingsSchema": { ... }
    }
  ]
}
```
- `settingsSchema` is a JSON Schema derived from the Zod schema.
- Fields include `model`, `depth`, `budgetUsd`, `maxTokens`, `concurrency`, `ephemeral`, `hitl`, prompt fields, `braveApiKey`.

---

### UC-09: Run — Happy Path (No HITL)

**Goal:** Create a run, observe streaming events, see completion.

**Preconditions:** HITL is OFF (default). `OPENROUTER_API_KEY` is set.

**Steps:**
1. In the UI, type a small question: `"What are CRDTs in two sentences?"`.
2. Click **Run** (or press `Cmd+Enter`).
3. Watch the StreamView timeline.
4. Wait for completion.

**Expected:**
- Run button triggers `POST /api/runs` → returns `{ id: "<uuid>" }`.
- UI immediately opens SSE stream to `GET /api/runs/<id>/events`.
- Status badge transitions: `idle` → `running` → `completed`.
- StreamView shows events in order:
  - `agent` phase event (planner starting)
  - `planner` event with subquestions
  - `researcher` events (tool calls: search, fetch)
  - `writer` event (draft deltas)
  - `factchecker` event (verdict)
  - `metric` events (token/cost updates during run)
  - `complete` event (final totals)
  - `status: completed`
- Cost counter in the StreamView shows live tokens + USD.
- Toast notification: "Run started" when it begins, "Run completed" when it finishes.
- The run appears in the history sidebar.

**API verification:**
```bash
# Create run
curl -s -X POST http://127.0.0.1:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"toolId":"deep-research","question":"What are CRDTs in two sentences?","settings":{}}' | jq

# Stream events (keep open)
curl -N http://127.0.0.1:3000/api/runs/<id>/events
```

---

### UC-10: Run — SSE Streaming Verification

**Goal:** Events stream incrementally, not batched after completion.

**Steps:**
1. Start a run with a longer question: `"Compare React, Vue, and Svelte for large-scale applications"`.
2. Open DevTools → Network tab → find the EventSource request to `/api/runs/<id>/events`.
3. Watch the EventStream tab or Messages panel.

**Expected:**
- Content-Type is `text/event-stream`.
- Events arrive incrementally during the run (not all at once at the end).
- Each SSE frame is `event: event\ndata: <JSON>\n\n`.
- Final frame is `event: done\ndata: {}\n\n`.
- Timeline in the UI updates in real-time as events arrive.
- Auto-scroll follows new events; scrolling up unpins auto-scroll.

---

### UC-11: Run — Cancel In-Flight

**Goal:** Running job can be cancelled from UI or API.

**Steps:**
1. Start a longer question (medium depth).
2. Click **Stop** button while the run is still in `running` state.

**Expected:**
- UI sends `POST /api/runs/<id>/cancel`.
- Server calls `AbortController.abort()` on the runner.
- Status transitions to `cancelled`.
- SSE stream emits an `error` event with `code: "CANCELLED"`, then `status: cancelled`, then `done`.
- StreamView shows the cancelled status.
- Toast: "Stop request sent", then "Run cancelled".
- The SSE connection closes cleanly — UI does not hang.
- The run appears in history with `cancelled` status.

**API verification:**
```bash
curl -s -X POST http://127.0.0.1:3000/api/runs/<id>/cancel | jq
# Expected: { "cancelled": true }
```

---

### UC-12: HITL — Plan Approval (Approve)

**Goal:** Run pauses for plan approval; approving continues the research.

**Preconditions:** Enable HITL for Deep Research.

**Steps:**
1. Open Settings → set `hitl: true` for Deep Research. Save.
2. Enter question: `"What is the current state of quantum computing?"`.
3. Click Run.
4. Wait for the PlanApprovalModal to appear.
5. Inspect the plan (shows subquestions + search queries).
6. Click **Approve**.

**Expected:**
- After planner completes, SSE emits `hitl-required` event with the plan payload.
- The PlanApprovalModal opens automatically showing the research plan.
- Plan shows subquestions and search queries in read-only preview mode.
- Clicking Approve sends `POST /api/runs/<id>/approve` with `{ "decision": "approve" }`.
- SSE emits `hitl-resolved` with `decision: "approve"`.
- Research continues: researcher events, writer events, factchecker events flow in.
- Run completes normally.

**API verification:**
```bash
# Manual approve via curl
curl -s -X POST http://127.0.0.1:3000/api/runs/<id>/approve \
  -H 'Content-Type: application/json' \
  -d '{"decision":"approve"}' | jq
# Expected: { "ok": true }
```

---

### UC-13: HITL — Plan Rejection

**Goal:** Rejecting the plan cancels the run.

**Preconditions:** HITL enabled.

**Steps:**
1. Start a new run with HITL on.
2. Wait for PlanApprovalModal.
3. Click **Reject**.

**Expected:**
- `POST /api/runs/<id>/approve` sent with `{ "decision": "reject" }`.
- SSE emits `hitl-resolved` with `decision: "reject"`.
- SSE emits `error` event with `code: "HITL_REJECTED"`, message: `"Plan approval rejected"`.
- Run status transitions to `cancelled`.
- Toast: "Plan approval rejected".
- Run appears in history as `cancelled`.

**Alternative:** Press **Escape** while the modal is open → same behavior as Reject.

---

### UC-14: HITL — Edit Plan Then Approve

**Goal:** User can modify the research plan before approving.

**Preconditions:** HITL enabled.

**Steps:**
1. Start a run with HITL.
2. When the modal appears, switch to **Edit mode**.
3. Modify a subquestion text or add/remove a search query.
4. Click **Approve** (with edits).

**Expected:**
- Edit mode allows inline editing of subquestions and search queries.
- `POST /api/runs/<id>/approve` sent with `{ "decision": "approve", "editedPlan": <modified plan> }`.
- The research continues using the edited plan (the modified subquestions/queries are used).
- `hitl-resolved` event includes `editedPlan` field.

---

### UC-15: History — View Past Runs

**Goal:** Completed runs appear in sidebar and can be replayed.

**Preconditions:** At least 2-3 completed runs from previous test cases.

**Steps:**
1. Look at the left sidebar's history section.
2. Observe the run cards.
3. Click on a completed run.

**Expected:**
- History sidebar lists runs sorted by `createdAt` desc (newest first).
- Each run card shows: tool icon, question preview (truncated), status dot (colored), cost, relative time.
- Clicking a completed run loads its events from SQLite replay.
- The StreamView populates with the stored events in order.
- The query textarea fills with the run's original question.
- Status badge shows the run's final status.

**API verification:**
```bash
# List runs
curl -s http://127.0.0.1:3000/api/runs | jq '.runs | length'

# Get specific run
curl -s http://127.0.0.1:3000/api/runs/<id> | jq

# Replay events (from SQLite, not live)
curl -N http://127.0.0.1:3000/api/runs/<id>/events
```

For completed runs, the SSE replay should:
- Emit all stored events in sequence order.
- End with `event: done\ndata: {}\n\n`.
- Close the connection immediately after (no blocking).

---

### UC-16: History — Search and Filter

**Goal:** Sidebar search and status filters work.

**Steps:**
1. Type a keyword from a past run's question in the search input.
2. Toggle status filter pills: `all` / `running` / `completed` / `failed` / `cancelled`.

**Expected:**
- Search filters runs client-side (instant) and also debounces a server refetch.
- Status filter pills narrow the list to matching statuses.
- Combining search + filter works (AND logic).
- Empty results show a clear "no runs" state.

**API verification:**
```bash
curl -s "http://127.0.0.1:3000/api/runs?status=completed" | jq
curl -s "http://127.0.0.1:3000/api/runs?q=CRDT" | jq
curl -s "http://127.0.0.1:3000/api/runs?limit=5" | jq
```

---

### UC-17: History — New Run Resets State

**Goal:** "New run" button resets the center panel.

**Steps:**
1. Select a past run from history (center panel shows its events).
2. Click **New Run** (or the + button in sidebar).

**Expected:**
- Run ID cleared.
- Query textarea emptied.
- View switches to `run` mode.
- Center panel shows "No active run" placeholder.
- Model select retains last-used model.

---

### UC-18: Report View

**Goal:** Completed runs can be viewed as a formatted report.

**Preconditions:** At least one completed run.

**Steps:**
1. Select a completed run.
2. In the top bar, click the **Stream/Report** toggle → switch to "Report".

**Expected:**
- Report renders as formatted markdown: headings, paragraphs, lists, code blocks, blockquotes.
- "Copy MD" button copies raw markdown to clipboard.
- "Download" button saves as `.md` file.
- Report toggle only appears for completed or running runs.
- Switching back to "Stream" shows the event timeline again.

---

### UC-19: Keyboard Shortcuts

**Goal:** Keyboard shortcuts work as expected.

**Steps & Expected:**

| Shortcut | Context | Expected |
|---|---|---|
| `Cmd+Enter` | Query textarea has text, status is `idle` | Triggers run |
| `Cmd+Enter` | Status is `running` | No effect (doesn't start another) |
| `Escape` | PlanApprovalModal open | Rejects the plan and closes modal |
| `Escape` | Settings panel open | Returns to run view |
| `Escape` | Normal run view | No effect |

---

### UC-20: Error — Missing API Key

**Goal:** Missing `OPENROUTER_API_KEY` produces a clear error.

**Steps:**
1. Stop the server.
2. Unset the env var: `unset OPENROUTER_API_KEY`.
3. Restart: `bun run web`.
4. Try to start a run.

**Expected:**
- The run creation may succeed (server doesn't validate key upfront).
- The SSE stream will emit an `error` event when the provider call fails (auth error from OpenRouter).
- Status transitions to `failed`.
- Toast: "Run failed".
- UI shows the error message in the StreamView timeline.
- No silent hang — the failure is visible.

---

### UC-21: Error — Empty Question

**Goal:** Submitting an empty question is prevented.

**Steps:**
1. Leave the query textarea empty.
2. Click Run.

**Expected:**
- **Client-side:** the Run button's `handleRun` returns early because `form.query.trim()` is empty. No API call made.
- **Server-side validation** (if bypassed via curl):

```bash
curl -s -X POST http://127.0.0.1:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"toolId":"deep-research","question":"","settings":{}}' | jq
```

Expected: HTTP `400` with Zod validation error (`question` must be min 1 char).

---

### UC-22: Error — Unknown Tool ID

**Goal:** Requesting a non-existent tool returns an error.

**Steps:**
```bash
curl -s -X POST http://127.0.0.1:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"toolId":"nonexistent","question":"test","settings":{}}' | jq
```

**Expected:**
- HTTP `400` with error message: `"Unknown tool: nonexistent"`.

---

### UC-23: Error — Run Not Found

**Goal:** Accessing a non-existent run returns 404.

**Steps:**
```bash
curl -s http://127.0.0.1:3000/api/runs/00000000-0000-0000-0000-000000000000 | jq
curl -s http://127.0.0.1:3000/api/runs/00000000-0000-0000-0000-000000000000/events
curl -s -X POST http://127.0.0.1:3000/api/runs/00000000-0000-0000-0000-000000000000/cancel | jq
```

**Expected:**
- GET run: `404` — `{ "error": "Run not found" }`.
- GET events: `404` — `{ "error": "Run not found" }`.
- POST cancel: `404` — `{ "error": "Run not found or already finished" }`.

---

### UC-24: Error — Cancel Already-Finished Run

**Goal:** Cancelling a completed run returns 404.

**Steps:**
1. Complete a run fully.
2. Try to cancel it:

```bash
curl -s -X POST http://127.0.0.1:3000/api/runs/<completed-id>/cancel | jq
```

**Expected:**
- `404` — `{ "error": "Run not found or already finished" }` (it's no longer in `activeRuns` map).

---

### UC-25: Error — Approve Without Pending HITL

**Goal:** Approving when no HITL is pending returns an error.

**Steps:**
```bash
curl -s -X POST http://127.0.0.1:3000/api/runs/<id>/approve \
  -H 'Content-Type: application/json' \
  -d '{"decision":"approve"}' | jq
```

**Expected:**
- HTTP `409` or `404` with an error message indicating no pending approval for this run.

---

### UC-26: Security — Bind Address

**Goal:** Server is local-only by default.

**Steps:**
1. Start the server with default config (no `HOST` override).
2. From another machine on the same network, try to reach `http://<your-ip>:3000/api/health`.

**Expected:**
- Connection refused. The server binds to `127.0.0.1`, not `0.0.0.0`.
- Only `localhost` / `127.0.0.1` origins pass the CORS check.

---

### UC-27: Security — CORS Policy

**Goal:** Only local origins are allowed.

**Steps:**
```bash
# Allowed origin
curl -s -H "Origin: http://localhost:5173" \
  -I http://127.0.0.1:3000/api/health 2>&1 | grep -i access-control

# Blocked origin
curl -s -H "Origin: http://evil.com" \
  -I http://127.0.0.1:3000/api/health 2>&1 | grep -i access-control
```

**Expected:**
- `localhost:*` and `127.0.0.1:*` origins receive `Access-Control-Allow-Origin` header.
- External origins (`http://evil.com`) do NOT receive the CORS header.

---

### UC-28: Settings Merge Hierarchy in Runner

**Goal:** When a run starts, settings merge in the correct order.

**Merge order:** `toolDef.defaultSettings` ← `globalSettings` ← `toolPersistence` ← `request.settings`

**Steps:**
1. Set global model to `openrouter/free`.
2. Set tool override model to `anthropic/claude-3.5-sonnet`.
3. Start a run with `settings: { "model": "google/gemini-flash-1.5" }` in the request body.

**Expected:**
- The runner uses `google/gemini-flash-1.5` (request-level wins).
- If request omits `model`, the runner uses `anthropic/claude-3.5-sonnet` (tool override wins).
- If tool override is cleared, the runner uses `openrouter/free` (global wins).

**API verification:**
```bash
curl -s -X POST http://127.0.0.1:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"toolId":"deep-research","question":"Test merge","settings":{"model":"google/gemini-flash-1.5"}}'
```

---

### UC-29: SSE Reconnect / Connection Drop

**Goal:** SSE consumer handles connection drops gracefully.

**Steps:**
1. Start a run.
2. While events are streaming, kill the Hono server process (Ctrl+C in the server terminal only, or kill the PID).
3. Observe the UI.

**Expected:**
- The UI detects the SSE connection loss.
- Toast: "Live stream disconnected: SSE connection lost".
- UI does not freeze or crash.
- The run status may show as `running` (stale) since the server died — but the UI indicates the stream is disconnected.

---

### UC-30: Data Persistence — Server Restart

**Goal:** Runs and settings survive server restarts.

**Steps:**
1. Complete a run.
2. Change some settings.
3. Stop the dev server (`Ctrl+C`).
4. Restart (`bun run web`).
5. Reload the UI.

**Expected:**
- History sidebar shows the previously completed run.
- Clicking it replays the stored events from SQLite.
- Settings panel shows the persisted values.
- The SQLite DB at `~/.web-studio/web-studio.db` contains all data.

---

### UC-31: Toast Notifications Summary

**Goal:** Verify all toast types fire correctly.

| Action | Toast Message | Type |
|---|---|---|
| Start a run | "Run started" | info |
| Run completes | "Run completed" | success |
| Run fails (provider error) | "Run failed" | error |
| Cancel a run | "Stop request sent" then "Run cancelled" | info |
| Reject HITL plan | "Plan approval rejected" | info |
| SSE connection lost | "Live stream disconnected: ..." | error |
| API call fails | Error message from API | error |
| Settings saved | "Saved" pill animation | — |

---

### UC-32: Concurrent Runs (Edge Case)

**Goal:** Starting a second run while one is active behaves correctly.

**Steps:**
1. Start a long-running research question.
2. While it's running, click "New Run" and start a second question.

**Expected:**
- The first run continues in the background (server-side).
- The UI switches to the new run's stream.
- Both runs appear in history with their respective statuses.
- Selecting the first run from history shows its events (if still running, shows live; if finished, replays from DB).

---

## Part 3: API Endpoint Reference

Quick reference for all endpoints to test via curl:

| Method | Path | Body | Success | Error |
|---|---|---|---|---|
| GET | `/api/health` | — | `200 { "status": "ok" }` | — |
| GET | `/api/tools` | — | `200 { "tools": [...] }` | — |
| GET | `/api/settings` | — | `200 { "global": {...}, "tools": {...} }` | — |
| PUT | `/api/settings` | `{ "scope": "...", "settings": {...} }` | `200 { "ok": true }` | `400` on invalid |
| POST | `/api/runs` | `{ "toolId", "question", "settings?" }` | `200 { "id": "uuid" }` | `400` on validation |
| GET | `/api/runs` | `?status=&q=&limit=` | `200 { "runs": [...] }` | — |
| GET | `/api/runs/:id` | — | `200 RunMeta` | `404` |
| GET | `/api/runs/:id/events` | — | SSE stream | `404` |
| POST | `/api/runs/:id/cancel` | — | `200 { "cancelled": true }` | `404` |
| POST | `/api/runs/:id/approve` | `{ "decision", "editedPlan?" }` | `200 { "ok": true }` | `404/409` |

---

## Part 4: Automated Checks

### Unit tests

```bash
bun test apps/web-studio/
```

Tests covered:
- `persistence.test.ts` — CRUD for settings, runs, events
- `runner.test.ts` — event bridging with `fakeProvider()`
- `runner-bridge.test.ts` — `AgentEvent` → `UIEvent` mapping
- `routes/runs.test.ts` — run creation, listing, SSE, cancel
- `routes/settings.test.ts` — GET/PUT, validation, merge, masking
- `routes/approve.test.ts` — approve/reject, no-pending error
- `routes/tools.test.ts` — tool registry listing
- `index.test.ts` — app health endpoint
- `tools/deep-research.test.ts` — ToolDef shape smoke test

### Full CI

```bash
bun run ci
```

All lint + typecheck + build + test pass. `apps/web-studio` included via workspace filters.

### Clone-and-own verification

```bash
# Delete web-studio, verify rest of repo still builds
rm -rf apps/web-studio
bun run ci
# Should pass — then restore
git checkout -- apps/web-studio
```

---

## Part 5: Test Execution Checklist

| # | Test Case | Status | Notes |
|---|---|---|---|
| UC-01 | App shell renders | ☐ | |
| UC-02 | Settings load defaults | ☐ | |
| UC-03 | Settings persist global | ☐ | |
| UC-04 | Settings per-tool override | ☐ | |
| UC-05 | Settings prompt persistence | ☐ | |
| UC-06 | Settings API key masking | ☐ | |
| UC-07 | Settings invalid payload | ☐ | |
| UC-08 | Tool registry list | ☐ | |
| UC-09 | Run happy path (no HITL) | ☐ | |
| UC-10 | SSE streaming verification | ☐ | |
| UC-11 | Run cancel in-flight | ☐ | |
| UC-12 | HITL approve | ☐ | |
| UC-13 | HITL reject | ☐ | |
| UC-14 | HITL edit + approve | ☐ | |
| UC-15 | History view past runs | ☐ | |
| UC-16 | History search + filter | ☐ | |
| UC-17 | History new run reset | ☐ | |
| UC-18 | Report view | ☐ | |
| UC-19 | Keyboard shortcuts | ☐ | |
| UC-20 | Error: missing API key | ☐ | |
| UC-21 | Error: empty question | ☐ | |
| UC-22 | Error: unknown tool | ☐ | |
| UC-23 | Error: run not found | ☐ | |
| UC-24 | Error: cancel finished run | ☐ | |
| UC-25 | Error: approve without HITL | ☐ | |
| UC-26 | Security: bind address | ☐ | |
| UC-27 | Security: CORS policy | ☐ | |
| UC-28 | Settings merge hierarchy | ☐ | |
| UC-29 | SSE reconnect / drop | ☐ | |
| UC-30 | Data persistence restart | ☐ | |
| UC-31 | Toast notifications | ☐ | |
| UC-32 | Concurrent runs | ☐ | |
| — | Unit tests pass | ☐ | `bun test apps/web-studio/` |
| — | Full CI green | ☐ | `bun run ci` |
| — | Clone-and-own verified | ☐ | delete + restore |
