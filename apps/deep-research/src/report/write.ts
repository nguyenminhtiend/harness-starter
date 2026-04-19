import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Report } from '../schemas/report.ts';

export function renderMarkdown(report: Report): string {
  const lines: string[] = [`# ${report.title}`, ''];

  for (const section of report.sections) {
    lines.push(`## ${section.heading}`, '', section.body, '');
  }

  if (report.references.length > 0) {
    lines.push('## References', '');
    for (const [i, ref] of report.references.entries()) {
      const label = ref.title ? `${ref.title} — ${ref.url}` : ref.url;
      lines.push(`[${i + 1}] ${label}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function writeReport(report: Report, outDir: string, slug: string): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });

  const ts = Date.now();
  const filename = `${slug}-${ts}.md`;
  const filePath = path.join(outDir, filename);
  const tmpPath = `${filePath}.tmp`;

  const content = renderMarkdown(report);
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);

  return filePath;
}
