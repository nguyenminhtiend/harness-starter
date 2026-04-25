import { describe, expect, test } from 'bun:test';
import { mockModel } from '@harness/mastra/testing';
import { generateReport } from './report-step.ts';

describe('generateReport', () => {
  test('produces markdown from the model response', async () => {
    const report = {
      title: 'Findings',
      sections: [{ heading: 'Background', body: 'Some facts [1].' }],
      references: [{ url: 'https://example.com/a', title: 'Source A' }],
    };
    const model = mockModel([{ type: 'text', text: JSON.stringify(report) }]);
    const markdown = await generateReport({
      model,
      findings: [
        { subquestionId: 'sq1', summary: 'Some facts', sourceUrls: ['https://example.com/a'] },
      ],
    });
    expect(markdown).toContain('# Findings');
    expect(markdown).toContain('## Background');
    expect(markdown).toContain('[Source A](https://example.com/a)');
  });
});
