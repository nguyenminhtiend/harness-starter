# Request Flows — harness-starter

_Two request shapes. Walk-through, then expert assessment._
_Date: 2026-04-25._

---

## Flow 1 — Normal (CRUD) request

Example: `GET /conversations/:id`, `PUT /settings`, `GET /capabilities`.

### Step-by-step

```
┌─────────┐
│ Client  │  HTTP GET /conversations/:id
└────┬────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ Hono app (packages/http/src/app.ts)              │
│  middleware chain:                                │
│   1. requestId       → generates X-Request-Id    │
│   2. cors            → permissive local CORS     │
│   3. bodyLimit       → 10 MB cap                 │
│   4. accessLogger    → pino entry on req+res     │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ Route handler                                     │
│  packages/http/src/routes/conversations.routes.ts│
│   • Zod validation via hono-zod-openapi          │
│   • Calls use case from @harness/core            │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ Use case (application service)                    │
│  packages/core/src/conversations/get.ts          │
│   • Pure function: (deps, input) → result        │
│   • Calls repository, applies domain rules        │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ Repository                                        │
│  packages/core/src/storage/conversation-store.ts │
│   • Structural interface + in-memory class       │
│   • Returns plain object                          │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ Hono serializes → JSON response 200              │
│  errorHandler middleware wraps for thrown errors │
└──────────────────────────────────────────────────┘
```

### Layers used

```
http  → core (use case)  → core (repository)
```

### Properties

- Synchronous request/response.
- Stateless — no shared mutable state.
- Errors thrown as `AppError` (mapped to status code in `error-handler.ts`).
- Validation at the boundary (Zod), trusted internally.

---

## Flow 2 — AI request (capability run)

Two endpoints in tandem: `POST /runs` (start) + `GET /runs/:id/events` (stream).

### 2a. Start the run

```
┌─────────┐
│ Client  │  POST /runs   { capabilityId, input, settings?, conversationId? }
└────┬────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ Hono middleware chain (same as Flow 1)            │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ runs.routes.ts → POST /                           │
│   • Validates StartRunBody                       │
│   • Creates AbortController                      │
│   • Stores controller in deps.runAbortControllers│
│   • Calls startRun(deps, body, signal)           │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ startRun() — packages/core/src/runs/start-run.ts │
│   1. Look up CapabilityDefinition by id          │
│   2. Generate runId via idGen                    │
│   3. Create Run aggregate (state: pending)       │
│   4. Persist Run to runStore                     │
│   5. Upsert conversation (if conversationId)     │
│   6. Resolve memory provider (if conversationId) │
│   7. Fire-and-forget: executor.execute(...)      │
│      ──── (returns immediately) ────             │
│   8. Return { runId }                            │
└────┬─────────────────────────────────────────────┘
     │
     ▼   201 Created  { runId }
┌─────────┐
│ Client  │
└─────────┘

         meanwhile, asynchronously…

┌──────────────────────────────────────────────────┐
│ RunExecutor.execute()                             │
│  packages/core/src/runs/run-executor.ts          │
│   • Run.transition(running) → emits run.started  │
│   • Iterates capability.runner(input, ctx):      │
│     for each StreamEventPayload:                 │
│        Run.emit(event)        ← single mutation  │
│        eventLog.append(event) ← persistence      │
│        eventBus.publish(event)← live fan-out     │
│   • On terminal: completed/failed/cancelled      │
│   • Calls onComplete callbacks                   │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ CapabilityRunner (in @harness/ai)                 │
│   agent-runner.ts  — wraps Mastra Agent          │
│   workflow-runner.ts — wraps Mastra Workflow     │
│   • Calls Mastra primitive with AbortSignal      │
│   • Maps Mastra chunks → StreamEventPayload      │
│   • Yields async-iterable of payloads             │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ Mastra Agent / Workflow                           │
│   • Calls LM via createLanguageModel(modelId)    │
│   • Tool calls, retrieval, streaming             │
│   • Workflow may suspend for HITL approval       │
└──────────────────────────────────────────────────┘
```

### 2b. Stream the events (SSE)

```
┌─────────┐
│ Client  │  GET /runs/:id/events
│         │  (with optional Last-Event-ID header)
└────┬────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ runs.routes.ts → GET /:id/events                  │
│   • Verify run exists                             │
│   • Parse Last-Event-ID → fromSeq+1               │
│   • Open ReadableStream with SSE framing          │
└────┬─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ streamRunEvents()                                 │
│  packages/core/src/runs/stream-run-events.ts     │
│   1. Subscribe to eventBus FIRST                 │
│   2. Read catchup from eventLog (≥ fromSeq)      │
│   3. Yield catchup, dedupe by seq                │
│   4. Yield live events from subscription          │
│   5. Stop on terminal (run.completed/failed/     │
│      cancelled)                                   │
└────┬─────────────────────────────────────────────┘
     │
     ▼   text/event-stream (one SessionEvent per message)
┌─────────┐
│ Client  │  receives:
│         │    event: session
│         │    id: 0
│         │    data: {"type":"run.started",...}
│         │
│         │    event: session
│         │    id: 1
│         │    data: {"type":"text.delta",...}
└─────────┘
```

### 2c. HITL (human-in-the-loop) approval

```
Workflow-runner inside executor               HTTP layer
─────────────────────────────────             ──────────────────────
  workflow.suspend({...})                  
  approvalQueue.request(approvalId, ...)
  ↓ awaits Promise                           POST /runs/:id/approve
                                             approveRun()
                                               approvalQueue.resolve(...)
  ↑ Promise resolves with decision        
  workflow.resume(decision)
  emits more StreamEventPayloads
```

`approvalQueue` holds an in-process `Map<approvalId, resolveFn>` plus an `earlyDecisions` bag (handles the race where `resolve` arrives before `request`).

### 2d. Cancellation

```
POST /runs/:id/cancel
  ↓
controller.abort()              → AbortSignal propagates
  ↓                                into Mastra primitive
deps.runAbortControllers.delete(runId)
                                   ↓
                                executor catches abort
                                Run.transition(cancelled)
                                emits run.cancelled
                                eventBus closes subscriptions
```

### 2e. Delete run

`DELETE /runs/:id` → `deleteRun(deps, runId)` use case →
- Aborts controller if active
- Deletes events from eventLog
- Deletes run from runStore
- Returns 204

(Now goes through a use case — was bypassing the aggregate before.)

---

## Expert assessment

### What's already excellent

| Pattern | Why it's right |
|---------|----------------|
| **Subscribe-then-replay (`stream-run-events.ts:25-26`)** | Subscribes to `eventBus` *before* reading `eventLog` catchup, dedupes by `seq`. This eliminates the classic race window where events emitted between "read catchup" and "subscribe" would be lost. |
| **Fire-and-forget `executor.execute()` (`start-run.ts:68-78`)** | POST /runs returns `{runId}` in <10ms regardless of run duration. Long jobs don't tie up the request. Errors logged via `.catch`. Correct pattern. |
| **Single mutation point — `Run.emit()`** | Every state transition flows through the aggregate. Replaying eventLog reconstructs the run; live subscribers get the same stream. |
| **Three-store split (run, eventLog, eventBus)** | `runStore` = current state, `eventLog` = persistent history (replay), `eventBus` = ephemeral fan-out. Each has one job. |
| **AbortSignal end-to-end** | Cancel propagates from HTTP route through executor into Mastra primitive into the LM SDK. |
| **`Last-Event-ID` resume** | Browser SSE auto-reconnects with this header. The server resumes from `fromSeq+1` correctly. |

### Concrete optimizations (real, not premature)

#### O1. SSE keepalive — production necessity

`runs.routes.ts:124-162` opens an SSE stream but emits nothing during idle periods. Reverse proxies (nginx default `proxy_read_timeout` = 60s) will close the connection if no bytes flow. Many CDNs do the same.

**Fix:** Emit `: keepalive\n\n` (SSE comment line, ignored by clients) every 15-30s. With `streamSSE` from `hono/streaming` you get this via the helper's heartbeat option.

```ts
return streamSSE(c, async (stream) => {
  const heartbeat = setInterval(() => stream.writeSSE({ data: '', event: 'ping' }), 15_000);
  try {
    for await (const event of streamRunEvents(deps, runId, fromSeq)) {
      await stream.writeSSE({ event: 'session', id: String(event.seq), data: JSON.stringify(event) });
    }
  } finally { clearInterval(heartbeat); }
});
```

This also fixes issue #8 from `architecture-review.md` (replace hand-rolled ReadableStream).

#### O2. SSE proxy-buffering header

Some proxies (nginx, AWS ALB) buffer responses by default, ruining SSE latency. Set the standard hint:

```ts
'X-Accel-Buffering': 'no'
```

on the `/runs/:id/events` response. One line, no downside.

#### O3. Backpressure on the event bus

Check `event-bus.ts`: if a slow SSE client can't keep up with token-stream throughput (e.g., 50 chunks/sec), the per-subscriber queue may grow unbounded.

**Question to verify:** does `createInMemoryEventBus()` use a bounded queue per subscription? If yes, what's the policy on overflow (drop oldest? close the subscription?)? If the queue is unbounded, document that a slow client can OOM the process — and consider a bounded ring buffer that drops with a warning.

#### O4. Token-batching for SSE

Each LM token → one `text.delta` `SessionEvent` → one SSE message. At 100 tokens/sec, that's 100 syscalls + 100 JSON.stringify + 100 framing wrappers per second per client.

**Optimization:** coalesce `text.delta` events on a 30-50ms window before flushing to the wire. The eventBus emits each one (so eventLog stays granular), but the SSE encoder batches.

**Don't do this prematurely** — only if profiling shows SSE serialization is hot. For dev/local it's fine.

#### O5. Event log unbounded growth

`createInMemoryEventLog()` keeps every event for every run, forever. A long chat with 100k tokens generates 100k+ events in memory.

**Fix path:**
- Short term: cap retention per-run (e.g., last 10k events) with a flag for "truncated."
- Long term: persist to LibSQL (already in your tech stack) and keep only a hot window in memory.

#### O6. `runAbortControllers` — three owners of one map

Already in `architecture-review.md` issue #3. Recap: route `set`/`delete`s on start/cancel/delete; executor `delete`s on completion (via `onComplete`); bootstrap exposes the map directly. Move ownership into the executor; expose `executor.cancel(runId)` and `executor.isActive(runId)`.

#### O7. Avoid re-resolving capability per request unnecessarily

`startRun` calls `capabilityRegistry.get(id)` per request — fine, it's a Map lookup. But `createLanguageModel(modelId)` inside the runner constructs a fresh LM client per run. For Ollama this is just a fetch wrapper (cheap). For OpenAI/Anthropic, the SDK client is also stateless and fast to construct. **No change needed today**, but if you swap to a provider with expensive client init, cache by `modelId`.

#### O8. SSE `data:` payload size

`JSON.stringify(event)` for a `tool.call.completed` event with a large tool result can produce a multi-KB SSE message. SSE has no message-size limit, but browsers buffer messages until a blank line. For very large tool outputs (file contents, big JSON), consider either:
- Streaming tool output as multiple `text.delta`-style chunks instead of a single completed event, or
- Sending only a tool-result *id* and letting the client fetch via a separate endpoint.

Only relevant if you have tool calls returning >100 KB results.

#### O9. Replay efficiency

Today on reconnect, `eventLog.read(runId, fromSeq)` returns an array of all events ≥ `fromSeq`. For a long-running run with a late-joining client (`fromSeq=0`), you replay everything synchronously into the stream before yielding any live events. Two optimizations:
- **Stream the catchup** — make `eventLog.read()` return `AsyncIterable<SessionEvent>` so memory stays bounded.
- **Compact terminal events** — once a run is `completed`, the SSE stream just needs the final state, not 50k token deltas. Offer a `?compact=true` query that skips `text.delta` and replays only structural events.

#### O10. The CRUD flow is already optimal

For Flow 1 there's nothing to optimize at the architectural level. Three layers (route → use case → store) is the minimum that preserves the "no route → store" invariant. Don't fold the use case into the route; don't add a "service" layer above it.

### Summary table

| Optimization | Impact | Effort | When |
|--------------|--------|--------|------|
| O1 SSE keepalive | High (prod-breaking without it) | 15 min | Now |
| O2 X-Accel-Buffering header | Medium | 2 min | Now |
| O3 Bus backpressure check | Medium | 30 min audit | Now |
| O4 Token batching | Low | 1 hr | Profile-driven |
| O5 Event log retention | Medium | 2-4 hr | Before "real" deploy |
| O6 Abort controller ownership | Medium | 1 hr | Already on the list |
| O7 LM client caching | Low | 30 min | Provider-dependent |
| O8 Large payload handling | Low | varies | Use-case-driven |
| O9 Replay streaming | Medium | 2 hr | If runs grow long |
| O10 CRUD flow | none — leave it | — | — |

### Verdict

**Both flows are already well-shaped.** The CRUD path is minimal-by-design and doesn't need changes. The AI path has the right backbone (event-sourcing-lite + subscribe-then-replay + fire-and-forget) — the gaps are operational hardening (O1, O2, O5) rather than architectural rework.

The single highest-leverage change today is **O1 + O2 + adopting `streamSSE`** — together that's ~30 minutes of work and turns the SSE flow from "works on localhost" into "works behind nginx/CDN."
