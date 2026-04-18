import { describe, expect, it } from 'bun:test';
import { ValidationError } from '@harness/core';
import { parseCliArgs } from './args.ts';

describe('parseCliArgs', () => {
  it('returns defaults for a bare glob pattern', () => {
    const cfg = parseCliArgs(['packages/**/*.eval.ts']);
    expect(cfg.pattern).toBe('packages/**/*.eval.ts');
    expect(cfg.models).toEqual([]);
    expect(cfg.concurrency).toBe(1);
    expect(cfg.exportAdapters).toEqual([]);
    expect(cfg.outputDir).toBe('.harness/reports');
    expect(cfg.scoreThreshold).toBeUndefined();
  });

  it('parses --models as comma-separated list', () => {
    const cfg = parseCliArgs(['--models', 'gpt-4o,claude-sonnet', 'evals/**/*.eval.ts']);
    expect(cfg.models).toEqual(['gpt-4o', 'claude-sonnet']);
    expect(cfg.pattern).toBe('evals/**/*.eval.ts');
  });

  it('parses --concurrency as number', () => {
    const cfg = parseCliArgs(['--concurrency', '4', '*.eval.ts']);
    expect(cfg.concurrency).toBe(4);
  });

  it('parses --export as comma-separated adapter list', () => {
    const cfg = parseCliArgs(['--export', 'inspect,langfuse', '*.eval.ts']);
    expect(cfg.exportAdapters).toEqual(['inspect', 'langfuse']);
  });

  it('parses --score-threshold as number', () => {
    const cfg = parseCliArgs(['--score-threshold', '80', '*.eval.ts']);
    expect(cfg.scoreThreshold).toBe(80);
  });

  it('parses --output to override output directory', () => {
    const cfg = parseCliArgs(['--output', 'custom/reports', '*.eval.ts']);
    expect(cfg.outputDir).toBe('custom/reports');
  });

  it('throws ValidationError when no positional pattern given', () => {
    expect(() => parseCliArgs([])).toThrow(ValidationError);
  });

  it('throws ValidationError for non-numeric concurrency', () => {
    expect(() => parseCliArgs(['--concurrency', 'abc', '*.eval.ts'])).toThrow(ValidationError);
  });

  it('throws ValidationError for concurrency < 1', () => {
    expect(() => parseCliArgs(['--concurrency', '0', '*.eval.ts'])).toThrow(ValidationError);
  });

  it('throws ValidationError for score-threshold outside 0-100', () => {
    expect(() => parseCliArgs(['--score-threshold', '101', '*.eval.ts'])).toThrow(ValidationError);
    expect(() => parseCliArgs(['--score-threshold', '200', '*.eval.ts'])).toThrow(ValidationError);
  });

  it('returns help flag when --help is passed', () => {
    const cfg = parseCliArgs(['--help']);
    expect(cfg.help).toBe(true);
  });
});
