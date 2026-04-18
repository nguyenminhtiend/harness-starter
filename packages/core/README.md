# @harness/core

Foundation package for the harness-starter monorepo. Provides the Provider abstraction, event bus, config helpers, error hierarchy, retry/cost/abort utilities, and a `fakeProvider()` test helper.

**Runtime boundary:** This package uses only Web-standard APIs (`fetch`, `ReadableStream`, `AbortSignal`). No Node/Bun-specific imports.

## Installation

Workspace-internal — imported by other `@harness/*` packages:

```ts
import { aiSdkProvider, createEventBus, withRetry } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
```

## API Reference

### Errors

All errors extend `HarnessError`, which carries `.class`, `.retriable`, `.cause`, `.context`, and `.toJSON()`.

| Class | `.class` | Retriable by default |
|---|---|---|
| `ProviderError` | `"provider"` | `rate_limit`, `timeout`, `server` = yes |
| `ToolError` | `"tool"` | no |
| `ValidationError` | `"validation"` | no |
| `GuardrailError` | `"guardrail"` | no |
| `BudgetExceededError` | `"budget"` | no |
| `LoopExhaustedError` | `"loop"` | no |

```ts
import { ProviderError } from '@harness/core';

throw new ProviderError('rate limited', {
  kind: 'rate_limit',
  status: 429,
  retryAfter: 5000,
});
```

### Provider

```ts
import { aiSdkProvider } from '@harness/core';
import { openai } from '@ai-sdk/openai';

const provider = aiSdkProvider(openai('gpt-4o'), {
  capabilities: { caching: true },
});

// Non-streaming
const result = await provider.generate({
  messages: [{ role: 'user', content: 'Hello' }],
});

// Streaming
for await (const event of provider.stream({ messages })) {
  if (event.type === 'text-delta') process.stdout.write(event.delta);
}
```

**Key types:** `Provider`, `ProviderCapabilities`, `GenerateRequest`, `GenerateResult`, `Message`, `StreamEvent`, `Usage`, `FinishReason`.

### Event Bus

Synchronous in-memory pub/sub with typed events.

```ts
import { createEventBus } from '@harness/core';

const bus = createEventBus();

const unsub = bus.on('provider.usage', (e) => {
  console.log(`${e.tokens.totalTokens} tokens, $${e.costUSD}`);
});

bus.emit('provider.usage', {
  runId: 'run-1',
  tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
});

unsub(); // stop listening
```

See `HarnessEvents` for the full event catalog (18 event types).

### Config

```ts
import { defineConfig, envConfig } from '@harness/core';
import { z } from 'zod';

// Validate a literal config object
const config = defineConfig(
  z.object({ port: z.number(), host: z.string() }),
  { port: 3000, host: 'localhost' },
);

// Validate from environment variables
const env = envConfig(
  z.object({
    OPENROUTER_API_KEY: z.string(),
    PORT: z.coerce.number().default(3000),
  }),
);
```

### Retry

Exponential backoff with jitter, `Retry-After` support, abort-wins semantics.

```ts
import { withRetry } from '@harness/core';

const result = await withRetry(
  (signal) => provider.generate(request, signal),
  { maxAttempts: 4, baseDelayMs: 500 },
  { signal: controller.signal, bus, runId: 'run-1' },
);
```

### Cost Tracking

```ts
import { createEventBus, trackCost, defaultPrices } from '@harness/core';

const bus = createEventBus();
const unsub = trackCost(bus, defaultPrices);

// provider.usage events now get enriched with costUSD
bus.on('provider.usage', (e) => {
  console.log(`Cost: $${e.costUSD}`);
});
```

`PriceBook` maps model IDs to per-million-token prices (`inputPerMTok`, `outputPerMTok`, `cachedInputPerMTok?`, `thinkingPerMTok?`).

### Abort Utilities

```ts
import { linkedSignal, timeoutSignal, assertNotAborted } from '@harness/core';

// Link multiple signals — aborts when any parent aborts
const signal = linkedSignal(parentSignal, AbortSignal.timeout(30000));

// Convenience timeout
const sig = timeoutSignal(5000);

// Guard — throws if already aborted
assertNotAborted(signal);
```

## Testing Utilities

Import from `@harness/core/testing`:

```ts
import { fakeProvider } from '@harness/core/testing';

const provider = fakeProvider([
  {
    events: [
      { type: 'text-delta', delta: 'Hello' },
      { type: 'text-delta', delta: ' world' },
      { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      { type: 'finish', reason: 'stop' },
    ],
  },
]);

const result = await provider.generate({ messages: [] });
// result.message.content === 'Hello world'
```

`fakeProvider` replays scripted `StreamEvent[]` sequences in order. Supports optional per-script `delayMs`, abort signal, and configurable capabilities.

## Test Command

```sh
bun test packages/core/
```
