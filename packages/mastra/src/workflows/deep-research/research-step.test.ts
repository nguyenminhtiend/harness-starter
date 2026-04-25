import { describe, expect, test } from 'bun:test';
import { mockModel } from '../../agents/testing.ts';
import { researchSubquestion } from './research-step.ts';

describe('researchSubquestion', () => {
  test('returns a finding when the model emits valid JSON', async () => {
    const text = JSON.stringify({
      subquestionId: 'sq1',
      summary: 'Found relevant facts',
      sourceUrls: ['https://example.com/a', 'https://example.com/b'],
    });
    const model = mockModel([{ type: 'text', text }]);
    const finding = await researchSubquestion({
      model,
      subquestion: { id: 'sq1', question: 'What happened?' },
    });
    expect(finding.subquestionId).toBe('sq1');
    expect(finding.summary).toContain('Found');
    expect(finding.sourceUrls).toHaveLength(2);
  });

  test('falls back to plain summary when the model response is not JSON', async () => {
    const model = mockModel([{ type: 'text', text: 'not valid json' }]);
    const finding = await researchSubquestion({
      model,
      subquestion: { id: 'sq2', question: 'Anything?' },
    });
    expect(finding.subquestionId).toBe('sq2');
    expect(finding.summary).toBe('not valid json');
    expect(finding.sourceUrls).toEqual([]);
  });
});
