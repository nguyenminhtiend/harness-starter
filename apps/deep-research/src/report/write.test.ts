import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Report } from '../schemas/report.ts';
import { renderMarkdown, writeReport } from './write.ts';

const sampleReport: Report = {
  title: 'CRDTs vs OT',
  sections: [
    { heading: 'Introduction', body: 'This report compares CRDTs and OT.' },
    { heading: 'CRDTs', body: 'CRDTs allow concurrent editing [1].' },
    { heading: 'Conclusion', body: 'Both have tradeoffs [2].' },
  ],
  references: [
    { url: 'https://example.com/crdt', title: 'CRDT Paper' },
    { url: 'https://example.com/ot', title: 'OT Overview' },
  ],
};

describe('renderMarkdown', () => {
  it('produces a markdown string with title as h1', () => {
    const md = renderMarkdown(sampleReport);
    expect(md).toStartWith('# CRDTs vs OT');
  });

  it('includes each section as h2', () => {
    const md = renderMarkdown(sampleReport);
    expect(md).toContain('## Introduction');
    expect(md).toContain('## CRDTs');
    expect(md).toContain('## Conclusion');
  });

  it('includes a References section with numbered URLs', () => {
    const md = renderMarkdown(sampleReport);
    expect(md).toContain('## References');
    expect(md).toContain('[1] CRDT Paper — https://example.com/crdt');
    expect(md).toContain('[2] OT Overview — https://example.com/ot');
  });

  it('handles references without titles', () => {
    const report: Report = {
      title: 'Test',
      sections: [{ heading: 'A', body: 'content' }],
      references: [{ url: 'https://example.com' }],
    };
    const md = renderMarkdown(report);
    expect(md).toContain('[1] https://example.com');
  });

  it('omits References section when no references', () => {
    const report: Report = {
      title: 'Test',
      sections: [{ heading: 'A', body: 'content' }],
      references: [],
    };
    const md = renderMarkdown(report);
    expect(md).not.toContain('## References');
  });
});

describe('writeReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes markdown file to the output directory', async () => {
    const filePath = await writeReport(sampleReport, tmpDir, 'test-report');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# CRDTs vs OT');
  });

  it('uses the slug in the filename', async () => {
    const filePath = await writeReport(sampleReport, tmpDir, 'my-slug');
    expect(path.basename(filePath)).toMatch(/^my-slug-\d+\.md$/);
  });

  it('creates the output directory if it does not exist', async () => {
    const nested = path.join(tmpDir, 'nested', 'dir');
    const filePath = await writeReport(sampleReport, nested, 'test');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
