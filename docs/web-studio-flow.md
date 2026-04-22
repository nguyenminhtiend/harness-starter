# How web-studio Works: Question Submission Flow

A detailed, line-by-line walkthrough of every layer from button click to streamed result.

---

## 1. User Types a Question and Clicks "Run"

### `SessionForm.tsx` — the form component

The form captures two pieces of state: `query` (the question text) and `model` (selected LLM).

```tsx
// SessionForm holds a textarea + model <select> + Run button
export function SessionForm({ form, setForm, onRun, onStop, status, compact }: SessionFormProps) {
  const running = status === 'running';
```

The textarea has an `onKeyDown` handler — pressing **Enter** (without Shift) fires `onRun()`:

```tsx
onKeyDown={(e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!running && form.query.trim()) {
      onRun();   // ← triggers the same handler as clicking "Run"
    }
  }
}}
```

The "Run" button itself just calls `onRun`:

```tsx
<Button variant="primary" size="lg" onClick={onRun} disabled={!form.query.trim()}>
  Run
</Button>
```

`onRun` is `mutations.handleRun` wired in `App.tsx`:

```tsx
const mutations = useSessionMutations({
  activeTool,    // "deep-research" by default
  form,          // { query, model }
  settings,      // persisted settings from GET /api/settings
  sessionId,
  setSessionId,
  setForm,
  setView: () => setView('session'),
  pushToast,
});

// ...
<SessionForm onRun={mutations.handleRun} ... />
```

---

## 2. `useSessionMutations` — Creating the Session

### `useSessionMutations.ts`

`handleRun` is a thin wrapper that guards against empty queries and duplicate submissions:

```ts
const handleRun = useCallback(() => {
  if (!form.query.trim() || createSession.isPending) {
    return;
  }
  createSession.mutate({ question: form.query, label: 'Session started' });
}, [form.query, createSession]);
```

The actual `createSession` is a TanStack Query mutation:

```ts
const createSession = useMutation({
  mutationFn: (vars: { question: string; label: string }) => {
    // Pull any persisted tool-specific settings (depth, budgetUsd, etc.)
    const toolOverrides =
      activeTool === 'deep-research'
        ? (settings?.tools['deep-research']?.values as Record<string, unknown> | undefined)
        : undefined;

    // POST /api/sessions
    return api.createSession({
      toolId: activeTool,          // "deep-research"
      question: vars.question,     // the user's query text
      settings: {
        ...(toolOverrides ?? {}),
        ...(form.model ? { model: form.model } : {}),  // model override if selected
      },
    });
  },
```

**On success:**

```ts
  onSuccess: (data, vars) => {
    setSessionId(data.id);        // updates URL hash + triggers SSE subscription
    setView('session');
    pushToast(vars.label, 'info');
  },
```

`setSessionId` comes from `useSessionRouter` which pushes a `#/sessions/<uuid>` hash into the browser history — this is how deep-linking works and is the trigger for the SSE connection.

**On settle** (success or error), it invalidates the sessions list query so the sidebar refreshes:

```ts
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
  },
```

---

## 3. `api.createSession` — The HTTP Call

### `api.ts`

```ts
createSession: (body: {
  toolId: string;
  question: string;
  settings?: Record<string, unknown>;
  resumeSessionId?: string;
}) =>
  json<{ id: string }>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
```

This `POST`s to `/api/sessions` with a JSON body like:

```json
{
  "toolId": "deep-research",
  "question": "What are the latest advances in quantum computing?",
  "settings": { "model": "google:gemini-2.5-flash", "depth": "medium" }
}
```

`json()` is a thin fetch wrapper that throws on non-2xx:

```ts
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
```

---

## 4. Server Entry Point — Hono App

### `server/index.ts`

At startup the server creates all infrastructure:

```ts
const config = loadConfig();                       // reads env vars (HOST, PORT, DATA_DIR, API keys)
const db = createDatabase(config.DATA_DIR);        // opens/creates SQLite DB at ~/.web-studio/web-studio.db

const app = createApp({
  sessionStore: createSessionStore(db),            // SQLite-backed session CRUD
  settingsStore: createSettingsStore(db),           // SQLite-backed settings KV
  getProviderKeys: () => config.providerKeys,      // API keys for OpenAI/Anthropic/Google/etc.
  approvalStore: createApprovalStore(),            // in-memory promise-based HITL approval queue
  hitlSessionStore: createHitlSessionStore(),      // tracks which sessions have active HITL state
});

Bun.serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT, idleTimeout: 255 });
```

`createApp()` mounts routes with CORS + body-limit middleware:

```ts
export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use('/api/*', localCors());    // CORS for local dev
  app.use('/api/*', bodyLimit());    // 1MB default body limit

  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/models', (c) => { ... });

  app.route('/api/sessions', createSessionsRoutes({ ... }));
  app.route('/api/tools', createToolsRoutes());
  app.route('/api/settings', createSettingsRoutes(deps.settingsStore));

  return app;
}
```

---

## 5. `POST /api/sessions` — Route Handler

### `sessions.routes.ts`

The Zod schema validates the request body:

```ts
const CreateSessionBody = z.object({
  toolId: z.string().min(1),
  question: z.string().min(1),
  settings: z.record(z.string(), z.unknown()).default({}),
  resumeSessionId: z.string().uuid().optional(),
});
```

The route handler does three things:

#### 5a. Parse and validate

```ts
routes.post('/', async (c) => {
  const result = await parseJsonBody(c, CreateSessionBody);
  if (!result.ok) {
    return result.response;    // 400 with Zod error details
  }

  const { toolId, question, settings, resumeSessionId } = result.data;
```

#### 5b. Start the session runner (fire-and-forget async generator)

```ts
  const sessionId = crypto.randomUUID();
  const ac = new AbortController();

  const handle = startSession(
    {
      sessionId,
      toolId,
      question,
      settings,
      signal: ac.signal,
      abortController: ac,
      providerKeys: getProviderKeys(),
    },
    sessionDeps,
  );
```

`startSession()` returns a `SessionHandle` = `{ sessionId, events: AsyncIterable<UIEvent> }`. It does NOT block — the async generator is lazy.

#### 5c. Wire up broadcast + return immediately

```ts
  const broadcast = createRunBroadcast();
  activeSessions.set(sessionId, { broadcast, abort: ac });

  // Background task: drain the generator, push each event into the broadcast
  void (async () => {
    try {
      for await (const ev of handle.events) {
        broadcast.push(ev);
      }
    } finally {
      broadcast.done();                // signals all SSE subscribers that the stream is finished
      activeSessions.delete(sessionId);
    }
  })();

  return c.json({ id: sessionId });   // ← 200 response returns immediately with just the UUID
});
```

The `activeSessions` map is the in-memory link between the background generator and any SSE subscribers. Multiple browser tabs can subscribe to the same session.

---

## 6. `startSession()` — The Session Runner

### `sessions.runner.ts`

This is the core orchestration function. It:

1. Resolves which tool to use
2. Merges settings (defaults → global → tool persistence → request overrides)
3. Creates the LLM provider
4. Builds the agent (graph)
5. Returns a lazy async generator of `UIEvent`s

```ts
export function startSession(ctx: SessionContext, deps: SessionDeps): SessionHandle {
  const { sessionId, toolId, question, settings, signal, abortController, providerKeys } = ctx;

  // 6a. Look up the tool definition from the registry
  const toolDef = registry[toolId] as ToolDef | undefined;
  if (!toolDef) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  // 6b. Merge settings through the precedence chain:
  //     defaults → global → tool persistence → secret storage → request overrides
  const mergedSettings = resolveSettings(toolId, settingsStore, settings);

  // 6c. Create the LLM provider (e.g. "google:gemini-2.5-flash" → Google AI SDK provider)
  const modelSpec = (mergedSettings.model as string) ?? 'google:gemini-2.5-flash';
  const provider = createProvider(providerKeys, modelSpec);

  // 6d. Create in-memory conversation store, checkpointer, and event bus
  const store = inMemoryStore();
  const checkpointer = inMemoryCheckpointer();
  const bus = createEventBus();

  // 6e. Parse settings through the tool's Zod schema
  const parsedSettings = toolDef.settingsSchema.parse(mergedSettings);

  // 6f. Build the agent (for deep-research, this creates the graph)
  const agent = toolDef.buildAgent({
    settings: parsedSettings,
    provider,
    store,
    checkpointer,
    bus,
    signal,
  });
```

#### 6g. Persist the session row in SQLite + emit initial status event

```ts
  sessionStore.createSession({ id: sessionId, toolId, question, status: 'running' });
  sessionStore.appendEvent(sessionId, {
    type: 'status',
    status: 'running',
    ts: Date.now(),
    runId: sessionId,
  });
```

#### 6h. The async generator — the main event loop

```ts
  async function* generate(): AsyncGenerator<UIEvent> {
    const unsubConsole = consoleSink(bus, { level: 'normal' });
    hitlSessionStore.register(sessionId, { checkpointer, abortController });

    try {
      while (true) {
        // Stream the agent — this runs the graph (plan → approve → research → write → fact-check)
        const stream = agent.stream(
          { userMessage: `<user_question>${question}</user_question>` },
          { signal, runId: sessionId },
        );

        // Convert each AgentEvent to UIEvent(s) and yield them
        for await (const event of stream) {
          const uiEvents = agentEventToUIEvents(event, sessionId, accUsage, toolNames);
          for (const uiEv of uiEvents) {
            sessionStore.appendEvent(sessionId, uiEv);  // persist to SQLite
            yield uiEv;                                   // push to broadcast → SSE
          }
        }

        // After the stream ends, check if it paused at plan approval (HITL)
        const saved = await checkpointer.load(sessionId);
        if (!isPausedAtPlanApproval(saved)) {
          break;  // graph completed normally — exit the loop
        }

        // HITL flow: wait for user approval
        const approvalPromise = approvalStore.waitFor(sessionId);
        const plan = planFromCheckpoint(saved);
        yield { type: 'hitl-required', ts: Date.now(), runId: sessionId, plan };

        const decision = await approvalPromise;  // blocks until POST /approve is called
        yield { type: 'hitl-resolved', ... };

        if (decision.decision === 'reject') {
          // Mark cancelled + yield error/status events, then return
          return;
        }

        // If approved, loop back to re-stream (graph resumes from checkpoint)
      }

      // Success path: yield complete + status events
      sessionStore.updateSession(sessionId, { status: 'completed', finishedAt: ... });
      yield { type: 'complete', ts: Date.now(), runId: sessionId, totalTokens, totalCostUsd, report };
      yield { type: 'status', status: 'completed', ts: Date.now(), runId: sessionId };

    } catch (err) {
      // Error/abort path: yield error + status events
      const isAbort = err.name === 'AbortError' || signal.aborted;
      const status = isAbort ? 'cancelled' : 'failed';
      yield { type: 'error', ..., message };
      yield { type: 'status', status, ... };

    } finally {
      unsubConsole();
      hitlSessionStore.unregister(sessionId);
    }
  }

  return { sessionId, events: generate() };
```

---

## 7. `agentEventToUIEvents` — Event Translation

### `packages/session-events/src/bridge.ts`

The agent's internal `AgentEvent` types (from `@harness/agent`) are translated to the UI-friendly `UIEvent` types:

| AgentEvent          | UIEvent(s)                                            |
|---------------------|-------------------------------------------------------|
| `turn-start`        | `agent` phase event (`"turn-1"`, `"turn-2"`, ...)     |
| `tool-start`        | `tool` event with `toolName` + `args`                 |
| `tool-result`       | `tool` event with `result` + `durationMs`             |
| `tool-error`        | `tool` event with `isError: true`                     |
| `usage`             | `metric` event with accumulated token counts          |
| `text-delta`        | `writer` event with streaming text delta              |
| `handoff`           | `agent` phase event (`"planner → researcher"`)        |
| `budget.exceeded`   | `error` event with code `BUDGET_EXCEEDED`             |
| `abort`             | `error` event with code `ABORTED`                     |
| `checkpoint`        | (silently dropped)                                    |

Token usage is **accumulated** across the entire session:

```ts
case 'usage': {
  const inp = e.tokens.inputTokens ?? 0;
  const out = e.tokens.outputTokens ?? 0;
  accUsage.inputTokens += inp;
  accUsage.outputTokens += out;
  // Each metric event carries the running total, not a delta
  events.push({ type: 'metric', inputTokens: accUsage.inputTokens, ... });
}
```

---

## 8. The Broadcast Layer

### `infra/broadcast.ts`

`RunBroadcast` is a simple in-memory pub/sub that bridges the async generator to multiple SSE clients.

```ts
export function createRunBroadcast(): RunBroadcast {
  const buffer: UIEvent[] = [];    // ordered event log (append-only)
  let finished = false;
  const waiters: Array<{ resolve: () => void }> = [];
```

**`push(event)`** — appends to buffer and wakes all waiting subscribers:

```ts
push(event) {
  if (finished) return;
  buffer.push(event);
  notify();           // resolves all pending promises in the waiters array
},
```

**`subscribe(fromSeq)`** — returns an `AsyncIterable` that yields `{ seq, event }` pairs. A new subscriber can "catch up" by starting from seq 0:

```ts
subscribe(fromSeq = 0): AsyncIterable<{ seq: number; event: UIEvent }> {
  let cursor = Math.max(0, fromSeq);
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          // If cursor is past the buffer and not done, wait for new events
          while (cursor >= buffer.length && !finished) {
            await new Promise<void>((resolve) => {
              waiters.push({ resolve });
            });
          }
          if (cursor < buffer.length) {
            const event = buffer[cursor];
            cursor++;
            return { done: false, value: { seq, event } };
          }
          return { done: true, value: undefined };  // stream finished
        },
      };
    },
  };
},
```

**`done()`** — marks the broadcast as finished, waking all waiters so they return `{ done: true }`.

---

## 9. `GET /api/sessions/:id/events` — SSE Endpoint

### `sessions.routes.ts`

When the UI opens an EventSource connection, this route handles it:

```ts
routes.get('/:id/events', (c) => {
  const sessionId = c.req.param('id');
  const active = activeSessions.get(sessionId);
```

**Case 1: Session is still running** — subscribe to the live broadcast:

```ts
  if (active) {
    const lastEventId = c.req.header('Last-Event-ID');
    const fromSeq = lastEventId ? parseInt(lastEventId, 10) + 1 : 0;
    const sub = active.broadcast.subscribe(fromSeq);

    return streamSSE(c, async (stream) => {
      for await (const { seq, event } of sub) {
        await stream.writeSSE({
          event: 'event',
          id: String(seq),              // enables Last-Event-ID reconnection
          data: JSON.stringify(event),
        });
      }
      await stream.writeSSE({ event: 'done', data: '{}' });  // signals clean end
    });
  }
```

**Case 2: Session already finished** — replay from SQLite:

```ts
  const storedEvents = sessionStore.getEvents(sessionId);
  return streamSSE(c, async (stream) => {
    let seq = 0;
    for (const stored of storedEvents) {
      await stream.writeSSE({
        event: 'event',
        id: String(seq),
        data: JSON.stringify({ type: stored.type, ts: stored.ts, runId: sessionId, ...stored.payload }),
      });
      seq++;
    }
    await stream.writeSSE({ event: 'done', data: '{}' });
  });
```

This means clicking on an old session in the sidebar replays its full event history.

---

## 10. `connectSSE` — Client-Side SSE Consumer

### `api.ts`

```ts
export function connectSSE(
  sessionId: string,
  onEvent: (ev: UIEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  const es = new EventSource(`${BASE}/sessions/${sessionId}/events`);
  let closedNormally = false;

  // Listen for "event" SSE events, parse JSON, forward to callback
  es.addEventListener('event', (e) => {
    try {
      const parsed = JSON.parse(e.data) as UIEvent;
      onEvent(parsed);
    } catch {
      // skip malformed events
    }
  });

  // Listen for "done" SSE event — clean close
  es.addEventListener('done', () => {
    closedNormally = true;
    es.close();
    onDone();
  });

  // On error (network drop, server crash) — close and notify
  es.onerror = () => {
    es.close();
    if (!closedNormally) {
      onError(new Error('SSE connection lost'));
    }
  };

  return () => es.close();   // cleanup function for React effect
}
```

---

## 11. `useEventStream` — React Hook for Live Events

### `hooks/useEventStream.ts`

This hook subscribes to SSE when `sessionId` changes and accumulates events into state:

```ts
export function useEventStream(sessionId: string | null, options?: UseEventStreamOptions) {
  const [state, setState] = useState<StreamState>({ events: [], status: 'idle' });

  useEffect(() => {
    if (!sessionId) {
      setState({ events: [], status: 'idle' });
      return;
    }

    setState({ events: [], status: 'running' });  // optimistic: assume running

    const close = connectSSE(
      sessionId,

      // onEvent callback — append event to state, update status if it's a status event
      (ev) => {
        if (ev.type === 'hitl-required') {
          optionsRef.current?.onHitlRequired?.(ev);  // triggers HITL modal
        }
        setState((prev) => ({
          ...prev,
          events: [...prev.events, ev],
          ...(ev.type === 'status' ? { status: ev.status } : {}),
        }));
      },

      // onDone — SSE stream ended cleanly; fetch final status from REST
      () => {
        void api.getSession(sid).then((session) => {
          setState((prev) => ({ ...prev, status: session.status }));
        });
      },

      // onError — SSE dropped; fetch status to see if it's truly dead
      (err) => {
        void api.getSession(sid).then((session) => {
          setState((prev) => ({ ...prev, error: err.message, status: session.status }));
        });
      },
    );

    return () => { disposed = true; close(); };
  }, [sessionId]);    // re-runs whenever sessionId changes
```

---

## 12. `StreamView` — Rendering the Event Timeline

### `components/StreamView.tsx`

Events are rendered as a vertical timeline. Each event gets a colored dot + label + content:

```tsx
export function StreamView({ events, status, onRetry, report }: StreamViewProps) {
  const visibleEvents = verbose ? events : events.filter((e) => !isVerbose(e));
```

Each event type maps to a visual label via `PHASE_META`:

| Event Type       | Label         | Color                    |
|-----------------|---------------|--------------------------|
| `agent`          | varies by phase: Planner/Researcher/Writer/Fact-Checker | phase-specific color |
| `tool`           | Tool          | accent blue              |
| `writer`         | Writer        | phase-writer color       |
| `metric`         | Metric        | disabled gray            |
| `status`         | Status        | tertiary                 |
| `complete`       | Complete      | success green            |
| `error`          | Error         | error red                |
| `hitl-required`  | Approval      | accent blue              |
| `hitl-resolved`  | Approval      | secondary                |

The `eventContent()` function formats each event type:

```ts
function eventContent(ev: UIEvent): string {
  switch (ev.type) {
    case 'writer':   return ev.delta ?? 'Writing…';
    case 'tool':     return ev.result ? `${ev.durationMs}ms · ${truncate(ev.result, 300)}`
                                      : `${ev.toolName}\n  ${formatArgs(ev.args)}`;
    case 'metric':   return `${ev.inputTokens.toLocaleString()} in / ${ev.outputTokens.toLocaleString()} out`;
    case 'complete': return `${ev.totalTokens.toLocaleString()} tokens · $${ev.totalCostUsd.toFixed(4)}`;
    case 'error':    return ev.message;
    // ...
  }
}
```

Auto-scroll is handled by a "pinned" mode that scrolls to bottom on new events.

When the session completes with a report, `InlineReport` renders the final markdown report below the timeline.

---

## 13. The Deep Research Graph

### `deep-research/graph.ts`

When `toolId === 'deep-research'`, the agent is a **graph** with these nodes executed in sequence:

```
plan → approve → research → write → fact-check → [finalize | write (retry)]
```

**Node: `plan`** — The planner LLM generates a `ResearchPlan` (structured output with subquestions).

**Node: `approve`** — If HITL is enabled, calls `interrupt('plan-approval')` which causes the graph to pause and checkpoint. The runner detects this and emits a `hitl-required` event, then awaits user approval.

**Node: `research`** — Runs all subquestions in parallel via `Promise.all`. Each subquestion spawns a researcher sub-agent that uses search tools to find information and returns a `Finding`.

**Node: `write`** — The writer LLM takes all findings and produces a structured `Report` (title, sections, references). If a previous fact-check failed, the issues are included as a hint.

**Node: `fact-check`** — The fact-checker LLM verifies citations in the report against source URLs. If it fails and retries remain, the edge routes back to `write`.

**Node: `finalize`** — No-op identity function. The graph is complete.

The conditional edge from `fact-check`:

```ts
{
  from: 'fact-check',
  to: (state) => {
    const s = state as ResearchState;
    if (s.factCheckPassed || (s.factCheckRetries ?? 0) >= MAX_FACT_CHECK_RETRIES) {
      return 'finalize';  // done
    }
    return 'write';       // retry writing with fact-check feedback
  },
}
```

Max 2 fact-check retries before accepting the report as-is.

---

## 14. Cancellation Flow

When the user clicks "Stop":

1. **UI:** `handleStop()` calls `api.cancelSession(sessionId)` → `POST /api/sessions/:id/cancel`
2. **Server route:** looks up the `AbortController` in `activeSessions` and calls `.abort()`
3. **Runner:** the `signal.aborted` check triggers, the generator catches the `AbortError`
4. **Generator catch block:** updates session status to `cancelled`, yields error + status events
5. **Broadcast:** receives the final events, then `done()` is called in the `finally` block
6. **SSE:** subscriber drains remaining events, receives `done` SSE event, closes
7. **UI:** `useEventStream` gets the status event, updates React state to `cancelled`
8. **Toast:** `useStatusToasts` detects `running → cancelled` transition, shows "Session cancelled"

---

## 15. Session Persistence and Replay

Every `UIEvent` is persisted to SQLite via `sessionStore.appendEvent()`. This means:

- Refreshing the page reconnects to a running session (broadcast still alive)
- Clicking a finished session replays all events from the DB
- Session list in sidebar queries `sessionStore.listSessions()`

The `useSessionRouter` hook syncs `sessionId` with the URL hash (`#/sessions/<uuid>`), so browser back/forward works.

---

## Complete Sequence Diagram

```
User (Browser)                   Hono Server                    Agent Runner
     │                                │                              │
     │ click "Run"                    │                              │
     │──POST /api/sessions───────────>│                              │
     │                                │ parseJsonBody(Zod)           │
     │                                │ crypto.randomUUID()          │
     │                                │ startSession()──────────────>│
     │                                │                              │ resolve tool
     │                                │                              │ merge settings
     │                                │                              │ createProvider()
     │                                │                              │ buildAgent() (graph)
     │                                │                              │ createSession in SQLite
     │                                │ createRunBroadcast()         │
     │                                │ spawn background drain loop  │
     │<──{ id: uuid }────────────────│                              │
     │                                │                              │
     │ setSessionId(uuid)             │                              │
     │ (triggers useEventStream)      │                              │
     │                                │                              │
     │──GET /sessions/:id/events────>│                              │
     │  (EventSource SSE)             │ subscribe to broadcast       │
     │                                │                              │
     │                                │      ┌───────────────────────│
     │                                │      │ agent.stream() begins │
     │                                │      │   plan node           │
     │                                │      │   approve node        │
     │                                │      │   research node(s)    │
     │                                │      │   write node          │
     │                                │      │   fact-check node     │
     │                                │      └───────────────────────│
     │                                │                              │
     │                                │<─── AgentEvent ──────────────│
     │                                │  agentEventToUIEvents()      │
     │                                │  appendEvent to SQLite       │
     │                                │  broadcast.push(uiEvent)     │
     │<──SSE: event {json}───────────│                              │
     │  useEventStream setState       │                              │
     │  StreamView re-renders         │                              │
     │                                │                              │
     │  ... (many events) ...         │                              │
     │                                │                              │
     │                                │<─── stream ends ─────────────│
     │                                │  broadcast.done()            │
     │<──SSE: done {}────────────────│                              │
     │  EventSource closes            │                              │
     │  api.getSession() for status   │                              │
     │  toast: "Session completed"    │                              │
```
