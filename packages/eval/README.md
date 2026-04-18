# @harness/eval

Eval framework for `@harness` agents. Wraps [Evalite](https://evalite.dev) with harness-specific scorers and export adapters.

## Usage

Eval files use `.eval.ts` suffix and run via `evalite`, not `bun test`.

```ts
// my-agent.eval.ts
import { evalite } from '@harness/eval';
import { exactMatch, includes } from '@harness/eval/scorers';

evalite('My Agent Eval', {
  data: [
    { input: 'What is 2+2?', expected: '4' },
    { input: 'Capital of France?', expected: 'Paris' },
  ],
  task: async (input) => {
    // Call your agent here
    return someAgent(input);
  },
  scorers: [exactMatch, includes()],
});
```

Run with:

```sh
npx evalite my-agent.eval.ts
npx evalite watch my-agent.eval.ts  # watch mode with UI at localhost:3006
```

## Scorers

Import from `@harness/eval/scorers`.

| Scorer | Type | Description |
|--------|------|-------------|
| `exactMatch` | Deterministic | Returns 1 if output === expected |
| `includes(opts?)` | Deterministic | Returns 1 if output contains expected. `{ ignoreCase: true }` for case-insensitive |
| `llmJudge({ provider, prompt })` | LLM-based | Uses a provider to judge output quality on 0-1 scale |
| `toolCalled(name, args?)` | Deterministic | Returns 1 if the named tool was invoked. Output must include `toolCalls` or `events` array |
| `finishedWithin(ms)` | Deterministic | Returns 1 if `output.durationMs <= ms` |

### Custom scorers

```ts
import { createScorer } from '@harness/eval';

const myScorer = createScorer<string, string, string>({
  name: 'myScorer',
  description: 'Checks something custom',
  scorer: ({ output }) => {
    return output.length > 10 ? 1 : 0;
  },
});
```

## Export adapters

### Inspect-AI log

Convert eval results to the [Inspect-AI](https://inspect.aisi.org.uk/) JSON log format:

```ts
import { toInspectLog } from '@harness/eval';

const log = toInspectLog(results);
await Bun.write('eval-log.json', JSON.stringify(log, null, 2));
```

### Langfuse trace

Push eval results as a [Langfuse](https://langfuse.com) trace:

```ts
import { toLangfuse } from '@harness/eval';
import { Langfuse } from 'langfuse';

const client = new Langfuse({ publicKey: '...', secretKey: '...' });
toLangfuse(results, client);
```

## Public API

### `@harness/eval`

| Export | Kind | Description |
|--------|------|-------------|
| `evalite` | Re-export | Evalite's `evalite()` function |
| `createScorer` | Function | Create a custom scorer |
| `toInspectLog` | Function | Convert results to Inspect-AI JSON |
| `toLangfuse` | Function | Push results to Langfuse |

### `@harness/eval/scorers`

| Export | Kind |
|--------|------|
| `exactMatch` | Scorer |
| `includes` | Scorer factory |
| `llmJudge` | Scorer factory |
| `toolCalled` | Scorer factory |
| `finishedWithin` | Scorer factory |

## Test

```sh
bun test packages/eval/
```
