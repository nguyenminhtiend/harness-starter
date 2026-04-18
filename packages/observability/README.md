# @harness/observability

Event-bus sinks that transform `HarnessEvents` into external observability formats. Each sink subscribes to the event bus and returns an unsubscribe function.

## Install

This package is part of the `harness-starter` monorepo — no separate install needed.

Peer dependencies (install only what you use):

```bash
# For OTel adapter
bun add @opentelemetry/api @opentelemetry/sdk-trace-base @opentelemetry/exporter-trace-otlp-http

# For Langfuse adapter
bun add langfuse
```

## Public API

| Export | Description |
|--------|------------|
| `consoleSink(bus, opts?)` | Log events to stdout with level-based filtering |
| `jsonlSink(bus, { path })` | Append events as JSONL to a file |
| `otelAdapter(bus, tracer)` | Map events to OpenTelemetry spans |
| `langfuseAdapter(bus, client)` | Map events to Langfuse traces/generations/spans |

## Usage

### consoleSink

```ts
import { createEventBus } from '@harness/core';
import { consoleSink } from '@harness/observability';

const bus = createEventBus();
const unsub = consoleSink(bus, { level: 'normal' }); // 'quiet' | 'normal' | 'verbose'

// ... run your agent ...
unsub(); // stop logging
```

Levels control which events are logged:
- **quiet** — `run.start`, `run.finish`, `run.error`, `budget.exceeded`
- **normal** (default) — adds `turn.*`, `tool.*`, `guardrail`, `handoff`, `compaction`, `checkpoint`
- **verbose** — adds `provider.*`, `structured.repair`

### jsonlSink

```ts
import { jsonlSink } from '@harness/observability';

const unsub = jsonlSink(bus, { path: './events.jsonl' });
// Each event becomes one JSON line: { timestamp, event, payload }
```

### otelAdapter

```ts
import { otelAdapter } from '@harness/observability';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-app');
const unsub = otelAdapter(bus, tracer);
```

Span hierarchy: `harness.run` → `harness.turn` → `harness.provider` | `harness.tool`

### langfuseAdapter

```ts
import { langfuseAdapter } from '@harness/observability';
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({ publicKey: '...', secretKey: '...' });
const unsub = langfuseAdapter(bus, langfuse);
```

The adapter accepts any object matching the `LangfuseClient` interface (exported from this package), so you can use a fake for testing.

## Test

```bash
bun test packages/observability
```
