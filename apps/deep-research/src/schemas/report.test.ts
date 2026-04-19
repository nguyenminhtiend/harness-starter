import { describe, expect, it } from 'bun:test';
import { Finding, Report } from './report.ts';

describe('Finding schema', () => {
  it('accepts a valid finding', () => {
    const result = Finding.safeParse({
      subquestionId: 'q1',
      summary: 'CRDTs allow concurrent editing without coordination.',
      sourceUrls: ['https://example.com/crdt'],
    });
    expect(result.success).toBe(true);
  });

  it('defaults sourceUrls to empty array', () => {
    const result = Finding.safeParse({
      subquestionId: 'q1',
      summary: 'Some finding.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceUrls).toEqual([]);
    }
  });
});

describe('Report schema', () => {
  it('accepts a valid report', () => {
    const result = Report.safeParse({
      title: 'CRDTs vs OT',
      sections: [
        { heading: 'Introduction', body: 'This report covers...' },
        { heading: 'CRDTs', body: 'CRDTs are...' },
      ],
      references: [{ url: 'https://example.com', title: 'Example' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects report with no sections', () => {
    const result = Report.safeParse({
      title: 'Empty',
      sections: [],
      references: [],
    });
    expect(result.success).toBe(false);
  });

  it('references default to empty array', () => {
    const result = Report.safeParse({
      title: 'Minimal',
      sections: [{ heading: 'Intro', body: 'content' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.references).toEqual([]);
    }
  });
});
