# @harness/cli

CLI for running eval suites across a model matrix, generating reports, and exporting results.

## Usage

```bash
# Run all eval files
bun run eval -- "packages/**/*.eval.ts"

# Run with model matrix
bun run eval -- --models gpt-4o,claude-sonnet "**/*.eval.ts"

# Parallel execution
bun run eval -- --concurrency 4 --models gpt-4o,claude-sonnet "**/*.eval.ts"

# Export results
bun run eval -- --export inspect,langfuse "**/*.eval.ts"

# Fail if average score below threshold
bun run eval -- --score-threshold 80 "**/*.eval.ts"
```

## Flags

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--models` | `-m` | — | Comma-separated model names. Fans out evals per model. |
| `--concurrency` | `-c` | `1` | Max parallel eval runs. |
| `--export` | `-e` | — | Export adapters: `inspect`, `langfuse` |
| `--output` | `-o` | `.harness/reports` | Output directory for reports |
| `--score-threshold` | — | — | Fail (exit 1) if average score below this (0-100) |
| `--help` | `-h` | — | Show usage |

## Output

Results are written to `.harness/reports/<timestamp>/`:

- **`results.jsonl`** — One JSON object per line per eval run
- **`report.html`** — Self-contained HTML report with score matrix

## Model Matrix

When `--models` is specified, the CLI sets `HARNESS_EVAL_MODEL` before each eval run.
Read this in your eval files to configure the provider:

```typescript
import { evalite } from 'evalite';
import { aiSdkProvider } from '@harness/core';

const model = process.env.HARNESS_EVAL_MODEL ?? 'gpt-4o';

evalite('my-eval', {
  data: () => [{ input: 'Hello', expected: 'Hi there!' }],
  task: async (input) => {
    const provider = aiSdkProvider(model);
    const result = await provider.generate({ messages: [{ role: 'user', content: input }] });
    return result.text;
  },
  scorers: [/* ... */],
});
```

## Dependencies

- `@harness/core` — error types
- `evalite` — eval execution (optional runtime dep; CLI degrades gracefully if missing)
- `@harness/eval` — export adapters (optional; `--export` logs a message if missing)
