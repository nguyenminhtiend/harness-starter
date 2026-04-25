import { describe, expect, mock, test } from 'bun:test';
import { assertUrlAllowed, fetchTool } from './fetch.ts';

describe('assertUrlAllowed (URL matching)', () => {
  test('allowed hostname string matches → permitted', () => {
    expect(() =>
      assertUrlAllowed('https://example.com/path', { allow: ['example.com'] }),
    ).not.toThrow();
  });

  test('denied hostname string → throws', () => {
    expect(() => assertUrlAllowed('https://evil.com/', { deny: ['evil.com'] })).toThrow(
      'denied by policy',
    );
  });

  test('URL not in allow list → throws', () => {
    expect(() => assertUrlAllowed('https://other.com/', { allow: ['example.com'] })).toThrow(
      'not allowed',
    );
  });

  test('deny takes precedence over allow (same hostname)', () => {
    expect(() =>
      assertUrlAllowed('https://example.com/', {
        allow: ['example.com'],
        deny: ['example.com'],
      }),
    ).toThrow('denied by policy');
  });

  test('RegExp matches against full URL string', () => {
    expect(() =>
      assertUrlAllowed('https://a.com/api/v1', { allow: [/^https:\/\/a\.com\/api\//] }),
    ).not.toThrow();
    expect(() =>
      assertUrlAllowed('https://a.com/other', { allow: [/^https:\/\/a\.com\/api\//] }),
    ).toThrow('not allowed');
  });

  test('no allow/deny → all URLs permitted', () => {
    expect(() => assertUrlAllowed('https://anywhere.test/foo', {})).not.toThrow();
    expect(() => assertUrlAllowed('https://elsewhere.test/', {})).not.toThrow();
  });

  test('private hosts are blocked', () => {
    expect(() => assertUrlAllowed('https://localhost/x', {})).toThrow('private');
    expect(() => assertUrlAllowed('https://127.0.0.1/x', {})).toThrow('private');
  });

  test('non-http schemes are blocked', () => {
    expect(() => assertUrlAllowed('ftp://example.com/', {})).toThrow('scheme');
  });
});

describe('fetchTool.execute', () => {
  test('returns stringified JSON with status, headers, body', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response('ok', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }) as typeof fetch;

    try {
      const tool = fetchTool();
      const out = await tool.execute({ url: 'https://example.com/' }, {});
      const parsed = JSON.parse(out as string) as {
        status: number;
        headers: Record<string, string>;
        body: string;
      };
      expect(parsed.status).toBe(200);
      expect(parsed.headers['content-type']).toBe('text/plain');
      expect(parsed.body).toBe('ok');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('redirect handling', () => {
  test('redirect to allowed host → follows and returns final response', async () => {
    const originalFetch = globalThis.fetch;
    let call = 0;
    globalThis.fetch = mock(async (input) => {
      const u = typeof input === 'string' ? input : (input as Request).url;
      call++;
      if (call === 1) {
        expect(u).toBe('https://a.com/start');
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://b.com/done' },
        });
      }
      expect(u).toBe('https://b.com/done');
      return new Response('final', { status: 200 });
    }) as typeof fetch;

    try {
      const tool = fetchTool({ allow: ['a.com', 'b.com'] });
      const out = await tool.execute({ url: 'https://a.com/start' }, {});
      const parsed = JSON.parse(out as string) as { status: number; body: string };
      expect(parsed.status).toBe(200);
      expect(parsed.body).toBe('final');
      expect(call).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('redirect to disallowed host → throws', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://blocked.com/' },
      });
    }) as typeof fetch;

    try {
      const tool = fetchTool({ allow: ['safe.com'] });
      await expect(tool.execute({ url: 'https://safe.com/here' }, {})).rejects.toThrow(
        'not allowed',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('redirect chain exceeding max depth → throws', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input) => {
      const u = typeof input === 'string' ? input : (input as Request).url;
      return new Response(null, {
        status: 302,
        headers: { Location: `${u}?n=1` },
      });
    }) as typeof fetch;

    try {
      const tool = fetchTool({ allow: ['example.com'] });
      await expect(tool.execute({ url: 'https://example.com/loop' }, {})).rejects.toThrow(
        /Too many redirects/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
