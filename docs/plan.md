# Plan — Simple Chat Assistant in web-studio

## Context

`apps/web-studio` currently ships one tool — Deep Research — whose agent is a 4-node graph with sub-agent budgets, HITL plan approval, and fact-checking. That complexity is load-bearing for the feature but obscures the shape of the underlying harness (`@harness/agent` + `Tool` + `Provider` + event bus) when you're trying to learn or debug the loop itself.

**Goal:** add a second tool, `simple-chat`, built with a bare `createAgent()` and two minimal tools (`calculator`, `get_time`). It should exercise the same integration points as Deep Research (tool registry → runner → provider → event bus → SSE → UI) but with every non-essential layer stripped out, so the agent/tool loop is legible end-to-end.

**User choices:**
- Tools: `calculator` + `get_time` (zero-deps, deterministic, obvious tool-call trace).
- UX: multi-turn chat with a new UI (not single-turn).

The multi-turn requirement is the one real design pressure: the current runner creates a fresh `inMemoryStore()` per session (`sessions.runner.ts:75`) and feeds a single `question` to `agent.stream()` (`sessions.runner.ts:216`). To keep conversation context across turns without disturbing Deep Research, we introduce a **`conversationId`** (orthogonal to `sessionId`) and an app-level registry of shared `ConversationStore`s keyed by it. Each chat turn is still a session — which is actually pedagogically useful, since every turn's event stream stays inspectable in history.

---

## Scope

**In:**
1. Two tool implementations: `calculatorTool`, `getTimeTool` — colocated in the chat feature folder, pure functions, colocated tests.
2. `simpleChatToolDef` — a `ToolDef` whose `buildAgent()` returns `createAgent({ provider, systemPrompt, tools, memory: store })`.
3. Registry entry in `tools.registry.ts`.
4. `conversationId` threaded from HTTP body → runner → shared `ConversationStore` registry. Deep Research behavior unchanged (no `conversationId` → fresh per-session store, as today).
5. New `ChatView.tsx` component: message list + input bar + inline tool-call rendering. Activated when `activeTool === 'simple-chat'`.
6. Minimal wiring in `App.tsx` to swap `ChatView` in for the existing `SessionForm` + `StreamView` pair when the chat tool is active.

**Out (explicit non-goals for v1):**
- Persisting conversation history across server restarts. In-memory map is fine — can upgrade to `@harness/memory-sqlite` later.
- Grouping per-turn sessions under one row in `HistorySidebar`. Per-turn rows are kept — they're useful for the "inspect each turn's events" learning workflow.
- HITL plan approval (irrelevant for chat).
- Markdown/image attachments, file uploads.
- Streaming tool-argument deltas in the UI (render tool calls after `tool.start` lands — no partial-arg UI).

---

## Dependency graph (DAG per root CLAUDE.md)

All changes live in `apps/web-studio`. No cross-package edits. No new package imports beyond what web-studio already has: `@harness/agent`, `@harness/core`, `@harness/llm-adapter`, `@harness/session-events`, `@harness/session-store`, `zod`, `hono`, `react`. The clone-and-own invariant is respected.

---

## Critical files

**Read / reuse (no changes):**
- `apps/web-studio/src/server/features/tools/types.ts` — `ToolDef`, `BuildAgentArgs` contract.
- `apps/web-studio/src/server/features/deep-research/index.ts` — pattern for a `ToolDef`.
- `packages/agent/src/create-agent.ts` — `createAgent()` signature.
- `packages/agent/src/tool.ts` — `tool()` type-helper.
- `packages/agent/src/memory/store.ts` — `inMemoryStore()`.
- `packages/core/src/testing/*` — `fakeProvider()` for tests (TDD in `packages/*` doesn't apply here; tests-after for `apps/*`, but `fakeProvider` is still the right pick per root CLAUDE.md).
- `apps/web-studio/src/server/features/sessions/sessions.types.ts` — `SessionContext` / `SessionHandle`.
- `apps/web-studio/src/ui/hooks/useEventStream.ts` — existing SSE hook; reuse as-is.
- `apps/web-studio/src/ui/api.ts` — API client; extend `createSession()` with optional `conversationId`.

**Create:**
- `apps/web-studio/src/server/features/simple-chat/tools/calculator.ts` + `.test.ts`
- `apps/web-studio/src/server/features/simple-chat/tools/get-time.ts` + `.test.ts`
- `apps/web-studio/src/server/features/simple-chat/index.ts` — `simpleChatToolDef`.
- `apps/web-studio/src/server/features/simple-chat/simple-chat.test.ts` — integration test using `fakeProvider()`.
- `apps/web-studio/src/ui/components/ChatView.tsx` — new component.

**Modify:**
- `apps/web-studio/src/server/features/tools/tools.registry.ts` — register `simpleChatToolDef`.
- `apps/web-studio/src/server/features/sessions/sessions.routes.ts` — accept `conversationId` in `CreateSessionBody`; pass into `SessionContext`.
- `apps/web-studio/src/server/features/sessions/sessions.types.ts` — add optional `conversationId` to `SessionContext`.
- `apps/web-studio/src/server/features/sessions/sessions.runner.ts` — use registry store when `conversationId` provided.
- `apps/web-studio/src/server/index.ts` — instantiate the `conversationStores` registry and pass via `SessionDeps`.
- `apps/web-studio/src/server/features/sessions/sessions.runner.ts` — `SessionDeps` gains `conversationStores: Map<string, ConversationStore>`.
- `apps/web-studio/src/ui/api.ts` — `createSession()` accepts optional `conversationId`.
- `apps/web-studio/src/shared/*` (if `CreateSessionRequest` type exists there; otherwise inline in `api.ts`).
- `apps/web-studio/src/ui/App.tsx` — branch `MainPane` body on `activeTool === 'simple-chat'` to render `ChatView`.

---

## Phased tasks (vertical slices)

Each phase is one complete, testable path. Checkpoints between phases = `bun run ci` green and a short manual verification.

### Phase 1 — Two tools + chat ToolDef, usable via existing single-turn UI

Goal: end-to-end chat with tools working on the existing `SessionForm` → `StreamView` path. No UI changes yet. Proves the harness wiring before adding multi-turn complexity.

**Task 1.1 — Implement `calculatorTool`**
- File: `apps/web-studio/src/server/features/simple-chat/tools/calculator.ts`
- Accept `{ expression: string }`; validate with a strict regex (`/^[0-9+\-*/().\s]+$/`) before evaluation; evaluate via `new Function('"use strict"; return (' + expr + ');')()`. Reject empty input and non-finite results.
- Return `{ result: number, expression: string }`.
- **Acceptance:** passes `calculator.test.ts` covering: happy path (`"2 + 3 * 4"` → 14), parens, decimals, rejects `"fetch('http://x')"`, rejects `""`, rejects `"1/0"` (Infinity → error).
- **Verify:** `bun test apps/web-studio/src/server/features/simple-chat/tools/calculator.test.ts`

**Task 1.2 — Implement `getTimeTool`**
- File: `apps/web-studio/src/server/features/simple-chat/tools/get-time.ts`
- Accept `{ timezone?: string }` (IANA); default UTC. Validate tz via `Intl.DateTimeFormat(undefined, { timeZone: tz })` (throws on invalid).
- Return `{ iso: string, unix: number, timezone: string, formatted: string }`.
- **Acceptance:** tests cover default UTC, explicit `"America/Los_Angeles"`, invalid tz returns a structured error (tool returns error payload rather than throwing — consistent with `fetchTool` style).
- **Verify:** `bun test apps/web-studio/src/server/features/simple-chat/tools/get-time.test.ts`

**Task 1.3 — Implement `simpleChatToolDef`**
- File: `apps/web-studio/src/server/features/simple-chat/index.ts`
- `settingsSchema`: `z.object({ model: z.string().default('openrouter/free'), systemPrompt: z.string().default('You are a helpful assistant. Use tools when they would give a better answer.'), maxTurns: z.number().int().min(1).max(10).default(5) })`.
- `buildAgent({ provider, settings, store, bus, signal })`: return `createAgent({ provider, systemPrompt: settings.systemPrompt, tools: [calculatorTool, getTimeTool], memory: store, events: bus, maxTurns: settings.maxTurns })`.
- Do **not** touch `checkpointer`, `pushUIEvent`, HITL.
- **Acceptance:** unit test using `fakeProvider()` scripts a response that calls `calculator`, verifies the tool fires, and the final message references the result. Same for `get_time`. Assert that `bus` receives `tool.start` / `tool.finish` events.
- **Verify:** `bun test apps/web-studio/src/server/features/simple-chat/simple-chat.test.ts`

**Task 1.4 — Register the tool**
- File: `apps/web-studio/src/server/features/tools/tools.registry.ts`
- Add `[simpleChatToolDef.id]: simpleChatToolDef`.
- **Acceptance:** `GET /api/tools` returns both `deep-research` and `simple-chat` with their auto-form schemas.
- **Verify:** `bun run build && curl http://localhost:3000/api/tools` after starting server.

**CHECKPOINT 1** — `bun run ci` green. Start server, select `simple-chat` in the existing tool picker, ask "What time is it in Tokyo and what is 42 * 17?". Verify in the stream view:
- `llm` events show the messages.
- Two `tool` events (one per tool) with args + results.
- `metric` events update token/cost.
- `complete` event fires with a final answer that mentions both pieces of data.

### Phase 2 — Server-side multi-turn: shared `ConversationStore` by `conversationId`

Goal: multiple sessions with the same `conversationId` share conversation history. Deep Research behavior unchanged.

**Task 2.1 — Extend API surface**
- `apps/web-studio/src/server/features/sessions/sessions.routes.ts`: add `conversationId: z.string().uuid().optional()` to `CreateSessionBody`. Pass into `SessionContext` when provided.
- `apps/web-studio/src/server/features/sessions/sessions.types.ts`: add optional `conversationId?: string` to `SessionContext`.
- **Acceptance:** route accepts the field; omitting it preserves current behavior.

**Task 2.2 — Add shared-store registry to `SessionDeps`**
- `apps/web-studio/src/server/features/sessions/sessions.runner.ts`: `SessionDeps` grows `conversationStores: Map<string, ConversationStore>`.
- In `startSession`: `const store = ctx.conversationId ? (conversationStores.get(ctx.conversationId) ?? (() => { const s = inMemoryStore(); conversationStores.set(ctx.conversationId!, s); return s; })()) : inMemoryStore();`.
- **Acceptance:** a unit test in `sessions.runner.test.ts` runs two sequential sessions with the same `conversationId`, uses a `fakeProvider()` that echoes the history length, and asserts turn 2 sees turn 1's messages.
- **Verify:** `bun test apps/web-studio/src/server/features/sessions/sessions.runner.test.ts`

**Task 2.3 — Instantiate registry at app level**
- `apps/web-studio/src/server/index.ts`: `const conversationStores = new Map<string, ConversationStore>();` created once, passed into `SessionDeps`.
- **Acceptance:** TypeScript compiles, deep-research run still works end-to-end.

**CHECKPOINT 2** — `bun run ci` green. Manual via curl or two rapid UI runs with a hardcoded `conversationId` in the chat body: turn 2 references something said in turn 1 (e.g., "my name is X" / "what's my name?"). Deep Research runs unchanged.

### Phase 3 — Multi-turn chat UI

Goal: a chat panel that sends turns with a shared `conversationId`, renders messages and tool calls inline.

**Task 3.1 — Extend API client**
- `apps/web-studio/src/ui/api.ts`: `createSession()` accepts `{ toolId, question, settings?, conversationId? }`. Serialize `conversationId` into the POST body.
- **Acceptance:** type-check passes; existing deep-research callers still work (conversationId is optional).

**Task 3.2 — Build `ChatView.tsx`**
- File: `apps/web-studio/src/ui/components/ChatView.tsx`
- Local state: `conversationId` (uuid on mount), `messages: ChatMessage[]` (`role: 'user' | 'assistant'` with optional `toolCalls: { name, args, result }[]`), `input: string`, `activeSessionId: string | null`, `status`.
- On submit: create user message optimistically, `api.createSession({ toolId: 'simple-chat', question: input, conversationId })`, set `activeSessionId`, open SSE via existing `useEventStream(activeSessionId)`.
- Event handling (delegate to a small reducer in the same file):
  - `llm` event with role `assistant` content → start/append a new assistant message bubble (use the final assistant message text; do not try to stream chunks via `llm` — that event shape is full messages).
  - `tool` events: attach to the current assistant bubble as an expandable "called `name`(args) → result" row.
  - `complete` → mark turn done, re-enable input.
  - `error` → show error in bubble.
- Render: scrollable message list, input bar at bottom, small "new chat" button that resets `conversationId` and `messages`.
- Styling: reuse tokens from `sample-ui/`/existing primitives (matches app aesthetic).
- **Acceptance:** renders without crashing when mounted; "new chat" resets state; a smoke test (e.g., `@testing-library/react`) asserts that submitting input triggers `api.createSession` with the current `conversationId`.

**Task 3.3 — Route chat tool to `ChatView` in `App.tsx`**
- In `MainPane`: when `activeTool === 'simple-chat'` and `view === 'session'`, render `<ChatView />`. Otherwise keep the current `SessionForm` + `StreamView` branch.
- Settings panel (view === 'settings') keeps working for both tools via the existing auto-form.
- **Acceptance:** switching tools in the sidebar swaps the main pane cleanly; deep-research UI unaffected.

**CHECKPOINT 3** — `bun run ci` green. Manual verification:
- Start server: `bun --cwd apps/web-studio run dev`.
- Select `simple-chat`, type "I'm in Berlin. What time is it here?" → assistant answers with tool call visible.
- Next turn: "And what's 1234 * 5678?" → calculator fires, answer references Berlin location if relevant (memory works).
- Click "new chat" → context reset; repeat; confirm second conversation doesn't see the first's messages.
- Switch back to `deep-research`; run a research question; confirm it still works.

### Phase 4 — Hygiene

**Task 4.1 — Final `bun run ci`**
- Lint, typecheck, build, test across workspaces.
- **Acceptance:** all green. No `biome-ignore` suppressions added. No `!` assertions. No `any`. No `console.*` outside of `apps/*` or test files.

**Task 4.2 — Update docs**
- Append a short "Tools" section to `apps/web-studio/CLAUDE.md` noting the two-tool chat example, if the update helps future-Claude. Keep it brief — one paragraph.
- (Do not add README files or other docs unless asked.)

---

## Testing strategy

- **`packages/*` policy** (TDD) does not apply — all changes are in `apps/web-studio`, which is tests-after per the app's own `CLAUDE.md`.
- **Provider mocking:** use `fakeProvider()` from `@harness/core/testing`. Never hand-roll a mock `Provider` (enforced by root CLAUDE.md).
- **Colocation:** `foo.ts` + `foo.test.ts` next to each other.
- **Live-provider tests** (if any): gate behind `HARNESS_LIVE=1`. Don't block CI on network calls.

## Verification

End-to-end sanity (once all phases land):

```bash
# From repo root
bun install
bun run ci                          # lint + typecheck + build + all unit tests
bun --cwd apps/web-studio run dev   # start server (127.0.0.1:3000)
```

Then in the browser:
1. `simple-chat` is visible in the tool picker.
2. A multi-turn conversation with tool use works; tool calls render inline; memory carries across turns in the same conversation.
3. "New chat" resets memory.
4. `deep-research` still runs identically to before.
5. Browser network tab: each turn is one `POST /api/sessions` + one SSE subscription, both carrying `conversationId`.

## Risks / things to watch

1. **`inMemoryStore` leaks.** The registry never evicts entries. Fine for local dev; mark a follow-up to add TTL or wire `@harness/memory-sqlite` if a user runs long conversations.
2. **`llm` event shape.** Quick-check: `agentEventToUIEvents` emits `llm` events as full messages, not token deltas. ChatView should render the final assistant message once per turn, not try to stream characters. Verify shape early in Task 3.2.
3. **Tool call ordering in UI.** A turn can fire multiple tools before the final assistant text. Render tool rows in arrival order under the assistant bubble for that turn; keyed by `toolName + ts` to stay stable.
4. **Abort on "new chat".** If a turn is still running when the user clicks "new chat", cancel via `POST /api/sessions/:id/cancel` before resetting state — else the stale session keeps writing events to the now-detached `conversationId`.
