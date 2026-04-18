import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { EvalRunResult } from './types.ts';

export async function generateHtmlReport(
  results: readonly EvalRunResult[],
  outputDir: string,
): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  const models = [...new Set(results.map((r) => r.model).filter((m): m is string => m != null))];
  const files = [...new Set(results.map((r) => r.file))];
  const hasMatrix = models.length > 0;
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harness Eval Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #1a1a2e; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .meta { color: #666; font-size: 0.875rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 2rem; }
  th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f0f0f5; font-weight: 600; font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .score-green { background: #d4edda; color: #155724; font-weight: 600; }
  .score-yellow { background: #fff3cd; color: #856404; font-weight: 600; }
  .score-red { background: #f8d7da; color: #721c24; font-weight: 600; }
  .score-error { background: #f8d7da; color: #721c24; font-style: italic; }
  .detail { margin-bottom: 1.5rem; }
  .detail h3 { font-size: 1rem; margin-bottom: 0.5rem; }
  .detail-scores { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .detail-scores span { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8125rem; }
</style>
</head>
<body>
<h1>Harness Eval Report</h1>
<p class="meta">
  Generated: ${new Date().toISOString()} &middot;
  ${files.length} eval file${files.length !== 1 ? 's' : ''} &middot;
  ${hasMatrix ? `${models.length} model${models.length !== 1 ? 's' : ''}` : 'single run'} &middot;
  ${formatDuration(totalDuration)}
</p>

${hasMatrix ? renderMatrix(results, models, files) : renderSingleModel(results, files)}

<h2>Details</h2>
${results.map((r) => renderDetail(r)).join('\n')}
</body>
</html>`;

  writeFileSync(join(outputDir, 'report.html'), html);
}

function renderMatrix(
  results: readonly EvalRunResult[],
  models: string[],
  files: string[],
): string {
  const lookup = new Map<string, EvalRunResult>();
  for (const r of results) {
    lookup.set(`${r.file}::${r.model}`, r);
  }

  const headerCells = models.map((m) => `<th>${esc(m)}</th>`).join('');
  const rows = files
    .map((file) => {
      const cells = models
        .map((model) => {
          const r = lookup.get(`${file}::${model}`);
          if (!r) {
            return '<td>—</td>';
          }
          if (r.error) {
            return `<td class="score-error">error</td>`;
          }
          return `<td class="${scoreClass(r.averageScore)}">${(r.averageScore * 100).toFixed(0)}%</td>`;
        })
        .join('');
      return `<tr><td>${esc(basename(file))}</td>${cells}</tr>`;
    })
    .join('\n');

  return `<table>
<thead><tr><th>Eval</th>${headerCells}</tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

function renderSingleModel(results: readonly EvalRunResult[], files: string[]): string {
  const rows = files
    .map((file) => {
      const r = results.find((x) => x.file === file);
      if (!r) {
        return '';
      }
      const scoreCell = r.error
        ? '<td class="score-error">error</td>'
        : `<td class="${scoreClass(r.averageScore)}">${(r.averageScore * 100).toFixed(0)}%</td>`;
      return `<tr><td>${esc(basename(file))}</td>${scoreCell}<td>${formatDuration(r.durationMs)}</td></tr>`;
    })
    .join('\n');

  return `<table>
<thead><tr><th>Eval</th><th>Score</th><th>Duration</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

function renderDetail(r: EvalRunResult): string {
  const scoreBadges = r.scores
    .map(
      (s) =>
        `<span class="${scoreClass(s.score)}">${esc(s.name)}: ${(s.score * 100).toFixed(0)}%</span>`,
    )
    .join('');

  return `<div class="detail">
<h3>${esc(basename(r.file))}${r.model ? ` — ${esc(r.model)}` : ''}</h3>
<div class="detail-scores">${scoreBadges || (r.error ? `<span class="score-error">${esc(r.error)}</span>` : '—')}</div>
</div>`;
}

function scoreClass(score: number): string {
  if (score >= 0.8) {
    return 'score-green';
  }
  if (score >= 0.5) {
    return 'score-yellow';
  }
  return 'score-red';
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
