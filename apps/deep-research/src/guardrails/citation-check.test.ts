import { describe, expect, it } from 'bun:test';
import { makeTestCtx } from '../test-utils.ts';
import { citationCheckHook, extractUrls } from './citation-check.ts';

const ctx = makeTestCtx();

describe('extractUrls', () => {
  it('extracts URLs from markdown reference links', () => {
    const text = 'See [1] for details.\n\n[1]: https://example.com/a\n[2]: https://example.com/b';
    expect(extractUrls(text)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('extracts inline URLs', () => {
    const text = 'Source: https://en.wikipedia.org/wiki/CRDT and https://arxiv.org/abs/123';
    const urls = extractUrls(text);
    expect(urls).toContain('https://en.wikipedia.org/wiki/CRDT');
    expect(urls).toContain('https://arxiv.org/abs/123');
  });

  it('returns empty array when no URLs found', () => {
    expect(extractUrls('No URLs here.')).toEqual([]);
  });
});

describe('citationCheckHook', () => {
  it('passes when all cited URLs were fetched', async () => {
    const fetched = new Set(['https://example.com/a', 'https://example.com/b']);
    const hook = citationCheckHook(fetched);

    const result = await hook({
      message: { role: 'assistant', content: 'Report text.\n\nhttps://example.com/a' },
      ctx,
    });
    expect(result.action).toBe('pass');
  });

  it('blocks when a cited URL was not fetched', async () => {
    const fetched = new Set(['https://example.com/a']);
    const hook = citationCheckHook(fetched);

    const result = await hook({
      message: {
        role: 'assistant',
        content: 'Report citing https://example.com/a and https://unfetched.com/x',
      },
      ctx,
    });
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.reason).toContain('unfetched.com');
    }
  });

  it('passes when report has no URLs', async () => {
    const fetched = new Set(['https://example.com/a']);
    const hook = citationCheckHook(fetched);

    const result = await hook({
      message: { role: 'assistant', content: 'A report with no citations.' },
      ctx,
    });
    expect(result.action).toBe('pass');
  });

  it('passes when fetchedUrls is empty and report has no URLs', async () => {
    const hook = citationCheckHook(new Set());
    const result = await hook({
      message: { role: 'assistant', content: 'No citations here.' },
      ctx,
    });
    expect(result.action).toBe('pass');
  });
});
