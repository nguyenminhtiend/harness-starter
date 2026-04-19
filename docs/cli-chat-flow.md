# CLI-Chat: Detailed Code Flow

Deep-dive into every function call when you type a message and press Enter.

---

## 1. Bootstrap (module load)

### 1a. Config validation — `apps/cli-chat/src/config.ts`

```
envConfig(schema)           // @harness/core – config/config.ts
  → schema.safeParse(process.env)
  → extracts { OPENROUTER_API_KEY, MODEL_ID, SYSTEM_PROMPT }
  → throws ValidationError on missing keys
```

### 1b. Provider construction — `apps/cli-chat/src/provider.ts`

```
createOpenRouter({ apiKey })          // @openrouter/ai-sdk-provider
  → returns LanguageModelV2 factory

openrouter.chat(MODEL_ID)             // returns a LanguageModelV2 instance

aiSdkProvider(model)                  // @harness/core – provider/ai-sdk-provider.ts
  → returns Provider { id, capabilities, generate, stream }
  → capabilities default to { caching:false, thinking:false, batch:false, structuredStream:false }
```

### 1c. Agent creation — `apps/cli-chat/src/index.ts:8-12`

```
createAgent({                         // @harness/agent – create-agent.ts
  provider,
  systemPrompt: '...',
  memory: inMemoryStore(),            // @harness/agent – memory/store.ts
})                                    //   → Map<string, Message[]> in closure
```

Inside `createAgent`:

```
1. builds LoopHooks {}
2. no tools       → hooks.waitForApproval = undefined
3. no compactor   → hooks.compact = undefined
4. no budgets     → hooks.checkBudget = undefined
5. hooks.insertCacheBreakpoints = insertCacheBreakpoints  // always set
6. returns { run, stream }   // stream is the async generator, run is a convenience wrapper
```

### 1d. Readline + signal wiring

```
readline.createInterface(...)
process.on('SIGINT', ...)   // if streaming → abort; else → exit
prompt()                    // first call — prints "you> "
```

---

## 2. User types a message and presses Enter

### Step-by-step call graph

```
rl.question callback fires with `line`
│
├── guard: empty line → re-prompt, return
│
├── streamAc = new AbortController()
├── streaming = true
│
├── createSpinner()                           // spinner.ts
│   └── returns { start(), stop() }
│       start() schedules a 100ms delay, then 80ms interval drawing braille frames
│
├── spinner.start()
│
├── createStreamRenderer({ onTextDelta, onError })  // @harness/agent – stream-renderer.ts
│   └── returns StreamRenderer { render(stream) }
│
└── renderer.render( agent.stream({ userMessage, conversationId }, { signal }) )
    │
    │  ┌──────────────────────────────────────────────┐
    │  │  agent.stream()  (create-agent.ts:62-80)     │
    │  │                                               │
    │  │  conversationId = input.conversationId         │
    │  │  runId = crypto.randomUUID()                   │
    │  │  signal = opts.signal                          │
    │  │                                               │
    │  │  yield* runLoopWithBudgetEvents(params, input) │
    │  └──────────────────────────────────────────────┘
    │
    │  ┌─────────────────────────────────────────────────┐
    │  │  runLoopWithBudgetEvents()  (loop.ts:273-292)   │
    │  │                                                  │
    │  │  try { yield* runLoop(params, input) }           │
    │  │  catch (BudgetExceededError) → yield event       │
    │  └─────────────────────────────────────────────────┘
    │
    ▼
```

---

## 3. `runLoop()` — the agentic loop (loop.ts:49-271)

This is the core of the system. For a simple chat (no tools), only **turn 1** executes and returns.

```
runLoop(params, input)
│
│  params = { provider, systemPrompt, tools:[], memory, hooks, bus:undefined, maxTurns:10 }
│  input  = { conversationId, userMessage: "Hello", runId, signal }
│
├── ctx = { runId, conversationId, signal, bus:undefined }
│
├── [1] LOAD HISTORY
│   messages = await memory.load(conversationId)
│   └── inMemoryStore.load()
│       └── return [...(map.get(id) ?? [])]        // first call → []
│
├── [2] LOAD CHECKPOINT (skipped — no checkpointer)
│
├── [3] PREPEND SYSTEM PROMPT
│   messages.length === 0 → prepend
│   messages = [{ role:'system', content:'You are a helpful assistant.' }]
│
├── [4] APPEND USER MESSAGE
│   messages.push({ role:'user', content:'Hello' })
│   await memory.append(conversationId, [userMsg])
│   └── inMemoryStore.append()
│       └── map.set(id, [...existing, ...messages])
│
│   messages = [
│     { role:'system', content:'You are a helpful assistant.' },
│     { role:'user',   content:'Hello' }
│   ]
│
├── [5] BUILD TOOL MAP (empty — no tools registered)
│
├── for turn = 1 to 10:
│   │
│   ├── assertNotAborted(signal)                    // abort.ts:20-24
│   │   └── if signal.aborted → throw DOMException('AbortError')
│   │
│   ├── hooks.checkBudget?.()                       // undefined → skip
│   │
│   ├── yield { type:'turn-start', turn:1 }
│   │
│   ├── hooks.compact?.(...)                        // undefined → skip
│   │
│   ├── hooks.runInputGuardrails?.(...)             // undefined → skip
│   │
│   ├── hooks.insertCacheBreakpoints(messages, provider)  // cache.ts
│   │   └── provider.capabilities.caching === false → return messages unchanged
│   │
│   ├── ┌─────────────────────────────────────────────────────────────┐
│   │   │  collectProviderStream()  (loop.ts:303-367)                 │
│   │   │                                                              │
│   │   │  request = { messages }  (no tools → no tools/toolChoice)    │
│   │   │                                                              │
│   │   │  no retryPolicy → stream = provider.stream(request, signal)  │
│   │   │                                                              │
│   │   │  ┌───────────────────────────────────────────────────────┐   │
│   │   │  │  aiSdkProvider.stream()  (ai-sdk-provider.ts:212-269) │   │
│   │   │  │                                                        │   │
│   │   │  │  params = {                                            │   │
│   │   │  │    model,                                              │   │
│   │   │  │    messages: toAiSdkMessages(messages),                │   │
│   │   │  │    maxRetries: 0,                                      │   │
│   │   │  │    abortSignal: signal                                 │   │
│   │   │  │  }                                                     │   │
│   │   │  │                                                        │   │
│   │   │  │  toAiSdkMessages():  (ai-sdk-provider.ts:29-67)       │   │
│   │   │  │    string content → { role, content: string }          │   │
│   │   │  │    part[] content → mapped to ai-sdk format            │   │
│   │   │  │                                                        │   │
│   │   │  │  result = streamText(params)     // Vercel AI SDK      │   │
│   │   │  │                                                        │   │
│   │   │  │  for await (chunk of result.fullStream):               │   │
│   │   │  │    'text-delta'      → yield { type:'text-delta', delta }│  │
│   │   │  │    'reasoning-delta' → yield { type:'thinking-delta' }  │  │
│   │   │  │    'tool-call'       → yield { type:'tool-call', ... }  │  │
│   │   │  │    'finish-step'     → yield { type:'usage', tokens }   │  │
│   │   │  │    'finish'          → yield { type:'finish', reason }  │  │
│   │   │  │                                                        │   │
│   │   │  │  on error → classifyError(e) → throw ProviderError     │   │
│   │   │  └───────────────────────────────────────────────────────┘   │
│   │   │                                                              │
│   │   │  Consumes the stream, accumulates:                           │
│   │   │    text += delta        (for each 'text-delta')              │
│   │   │    toolCalls.push(...)  (for each 'tool-call')               │
│   │   │    turnUsage = tokens   (for each 'usage')                   │
│   │   │    streamEvents.push(event)   (ALL events buffered)          │
│   │   │                                                              │
│   │   │  returns { text, toolCalls:[], turnUsage, streamEvents }     │
│   │   └─────────────────────────────────────────────────────────────┘
│   │
│   ├── for (ev of streamEvents) yield ev;
│   │   // yields text-delta, usage, finish events to the renderer
│   │
│   ├── accumulate totalUsage
│   │
│   ├── toolCalls.length === 0  →  TEXT-ONLY RESPONSE PATH
│   │   │
│   │   ├── assistantMsg = { role:'assistant', content: text }
│   │   │
│   │   ├── hooks.runOutputGuardrails?.(...)   // undefined → skip
│   │   │
│   │   ├── messages.push(assistantMsg)
│   │   │
│   │   ├── await memory.append(conversationId, [assistantMsg])
│   │   │   └── now memory has: [system, user, assistant]
│   │   │
│   │   ├── hooks.saveCheckpoint?.(...)        // undefined → skip
│   │   │
│   │   └── return  // generator completes
│   │
│   └── (if toolCalls existed, would execute tools and loop — see §4)
│
└── end runLoop
```

---

## 4. StreamRenderer processes yielded events

```
renderer.render(stream)               // stream-renderer.ts:37-75
│
├── for await (event of stream):      // consumes the AsyncGenerator from agent.stream()
│   │
│   │  startTime ??= Date.now()       // set on first event
│   │
│   └── dispatch(callbacks, event, accText, accUsage, accTurn)
│       │                              // stream-renderer.ts:78-137
│       │
│       ├── 'turn-start'  → accTurn()  (turns++)
│       │                  → callbacks.onTurnStart?.(turn)
│       │
│       ├── 'text-delta'  → accText(delta)  (text += delta)
│       │                  → callbacks.onTextDelta?.(delta)
│       │                    └── index.ts onTextDelta callback:
│       │                        if firstToken → spinner.stop(); firstToken=false
│       │                        process.stdout.write(delta)  ← USER SEES TEXT HERE
│       │
│       ├── 'usage'       → accUsage(tokens) (accumulate)
│       │                  → callbacks.onUsage?.(tokens)
│       │
│       └── 'finish'      → callbacks.onFinish?.(reason)
│
└── returns StreamSummary { text, turns, usage, durationMs }
```

---

## 5. Back in `index.ts` after `await renderer.render()`

```
summary = await renderer.render(...)
│
├── tokens = summary.usage.totalTokens ?? 0
├── duration = (summary.durationMs / 1000).toFixed(1)
├── stdout.write("(42 tokens · 1.2s)")
│
├── streaming = false
├── streamAc = null
│
└── prompt()  // recurse — show "you> " again
```

---

## 6. Tool call path (when agent has tools)

If the model returns tool calls, the flow diverges at loop.ts:162:

```
toolCalls.length > 0
│
├── build assistantMsg with content: [text_part, ...tool_call_parts]
├── messages.push(assistantMsg)
│
├── for each toolCall:
│   ├── if tool.requireApproval → yield 'tool-approval-required', wait for decision
│   └── else → approved
│
├── executeToolCalls(approvedCalls, toolMap, ctx)      // loop.ts:369-392
│   │
│   └── Promise.allSettled( toolCalls.map(executeSingleTool) )
│       │
│       └── executeSingleTool()                         // loop.ts:394-458
│           ├── yield 'tool-start'
│           ├── toolDef.parameters.safeParse(args)      // zod validation
│           ├── result = await toolDef.execute(args, ctx)
│           ├── yield 'tool-result' (or 'tool-error')
│           └── return ToolResultPart
│
├── messages.push(...toolResultMessages)
├── memory.append(conversationId, [assistantMsg, ...toolResults])
│
└── CONTINUE LOOP → next turn (model sees tool results, generates response)
```

---

## 7. Cancellation flow (Ctrl+C during stream)

```
SIGINT handler fires
│
├── streaming === true && streamAc !== null
│   └── streamAc.abort()
│       │
│       ├── signal.aborted = true
│       │
│       ├── assertNotAborted(signal) in runLoop → throw DOMException('AbortError')
│       │   OR
│       ├── streamText() in ai-sdk-provider sees aborted signal → throws
│       │
│       └── bubbles up to renderer.render() catch block
│           └── callbacks.onError?.(error)
│
└── back in index.ts catch:
    ├── err.name === 'AbortError'
    │   └── stdout.write("(cancelled)")
    └── prompt()  // loop continues
```

---

## 8. Memory across turns

```
Turn 1: user says "Hello"
  memory = [user:"Hello", assistant:"Hi there!"]

Turn 2: user says "What's 2+2?"
  memory.load() → [user:"Hello", assistant:"Hi there!"]
  prepend system prompt (already first? no — system was never stored in memory)
  → messages = [system:..., user:"Hello", assistant:"Hi there!", user:"What's 2+2?"]
  after response:
  memory = [user:"Hello", assistant:"Hi there!", user:"What's 2+2?", assistant:"4"]
```

Note: the system prompt is prepended fresh each `runLoop` call, not stored in memory.

---

## Object lifecycle diagram

```
index.ts (process lifetime)
│
├── config     ─ singleton, created once at import
├── provider   ─ singleton, created once at import
├── agent      ─ singleton { run, stream } — stateless, relies on memory store
├── memory     ─ inMemoryStore() — Map<conversationId, Message[]>, persists across prompts
├── conversationId ─ single UUID for entire session
│
└── per question:
    ├── streamAc        ─ new AbortController per question
    ├── spinner         ─ new spinner per question
    ├── renderer        ─ new StreamRenderer per question
    ├── runId           ─ new UUID per stream() call (inside createAgent)
    └── messages[]      ─ rebuilt from memory.load() + system prompt each time
```
