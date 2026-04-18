import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateHtmlReport } from './report.ts';
import type { EvalRunResult } from './types.ts';

const baseDir = join(tmpdir(), `harness-cli-report-test-${Date.now()}`);
let counter = 0;
function freshDir(): string {
  return join(baseDir, `run-${counter++}`);
}

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

const multiModelResults: EvalRunResult[] = [
  {
    file: '/packages/agent/src/chat.eval.ts',
    model: 'gpt-4o',
    scores: [
      { name: 'exactMatch', score: 1 },
      { name: 'includes', score: 0.8 },
    ],
    averageScore: 0.9,
    durationMs: 1200,
    error: undefined,
    timestamp: '2026-04-18T10:00:00.000Z',
  },
  {
    file: '/packages/agent/src/chat.eval.ts',
    model: 'claude-sonnet',
    scores: [
      { name: 'exactMatch', score: 0.6 },
      { name: 'includes', score: 0.4 },
    ],
    averageScore: 0.5,
    durationMs: 800,
    error: undefined,
    timestamp: '2026-04-18T10:00:01.000Z',
  },
  {
    file: '/packages/core/src/retry.eval.ts',
    model: 'gpt-4o',
    scores: [{ name: 'exactMatch', score: 0.3 }],
    averageScore: 0.3,
    durationMs: 500,
    error: undefined,
    timestamp: '2026-04-18T10:00:02.000Z',
  },
];

describe('generateHtmlReport', () => {
  it('generates a report.html file in the output directory', async () => {
    const dir = freshDir();
    await generateHtmlReport(multiModelResults, dir);
    expect(existsSync(join(dir, 'report.html'))).toBe(true);
  });

  it('produces valid HTML5', async () => {
    const dir = freshDir();
    await generateHtmlReport(multiModelResults, dir);
    const html = await Bun.file(join(dir, 'report.html')).text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes model names in the report', async () => {
    const dir = freshDir();
    await generateHtmlReport(multiModelResults, dir);
    const html = await Bun.file(join(dir, 'report.html')).text();
    expect(html).toContain('gpt-4o');
    expect(html).toContain('claude-sonnet');
  });

  it('includes eval file names', async () => {
    const dir = freshDir();
    await generateHtmlReport(multiModelResults, dir);
    const html = await Bun.file(join(dir, 'report.html')).text();
    expect(html).toContain('chat.eval.ts');
    expect(html).toContain('retry.eval.ts');
  });

  it('is self-contained with no external references', async () => {
    const dir = freshDir();
    await generateHtmlReport(multiModelResults, dir);
    const html = await Bun.file(join(dir, 'report.html')).text();
    expect(html).not.toMatch(/href=["']https?:\/\//);
    expect(html).not.toMatch(/src=["']https?:\/\//);
  });

  it('color-codes scores: green ≥0.8, yellow ≥0.5, red <0.5', async () => {
    const dir = freshDir();
    await generateHtmlReport(multiModelResults, dir);
    const html = await Bun.file(join(dir, 'report.html')).text();
    expect(html).toContain('score-green');
    expect(html).toContain('score-yellow');
    expect(html).toContain('score-red');
  });

  it('works with single model (no matrix)', async () => {
    const singleModel: EvalRunResult[] = [
      {
        file: '/a.eval.ts',
        model: undefined,
        scores: [{ name: 'test', score: 0.9 }],
        averageScore: 0.9,
        durationMs: 100,
        error: undefined,
        timestamp: '2026-04-18T10:00:00.000Z',
      },
    ];
    const dir = freshDir();
    await generateHtmlReport(singleModel, dir);
    const html = await Bun.file(join(dir, 'report.html')).text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('a.eval.ts');
  });
});
