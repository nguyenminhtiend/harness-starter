import { parseArgs } from 'node:util';
import { ValidationError } from '@harness/core';
import type { CliConfig } from './types.ts';

export function parseCliArgs(argv: string[]): CliConfig {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      models: { type: 'string', short: 'm' },
      concurrency: { type: 'string', short: 'c' },
      export: { type: 'string', short: 'e' },
      output: { type: 'string', short: 'o' },
      'score-threshold': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    return {
      pattern: '',
      models: [],
      concurrency: 1,
      exportAdapters: [],
      outputDir: '.harness/reports',
      scoreThreshold: undefined,
      help: true,
    };
  }

  const pattern = positionals[0];
  if (!pattern) {
    throw new ValidationError(
      'Missing required positional argument: glob pattern (e.g. "**/*.eval.ts")',
      {
        zodIssues: null,
      },
    );
  }

  const concurrency = parseConcurrency(values.concurrency);
  const scoreThreshold = parseScoreThreshold(values['score-threshold']);

  return {
    pattern,
    models: values.models ? values.models.split(',').map((s) => s.trim()) : [],
    concurrency,
    exportAdapters: values.export ? values.export.split(',').map((s) => s.trim()) : [],
    outputDir: values.output ?? '.harness/reports',
    scoreThreshold,
    help: false,
  };
}

function parseConcurrency(raw: string | undefined): number {
  if (raw == null) {
    return 1;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new ValidationError(`Invalid --concurrency: expected positive integer, got "${raw}"`, {
      zodIssues: null,
    });
  }
  return n;
}

function parseScoreThreshold(raw: string | undefined): number | undefined {
  if (raw == null) {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError(`Invalid --score-threshold: expected 0-100, got "${raw}"`, {
      zodIssues: null,
    });
  }
  return n;
}
