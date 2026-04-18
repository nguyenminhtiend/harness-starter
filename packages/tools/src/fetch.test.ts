import { describe, expect, mock, test } from 'bun:test';
import { ToolError } from '@harness/core';
import { assertUrlAllowed, fetchTool } from './fetch.ts';

const ctx = (signal: AbortSignal) => ({
  runId: 'r1',
  conversationId: 'c1',
  signal,
});

describe('assertUrlAllowed (URL matching)', () => {
  test('allowed hostname string matches → permitted', () => {
    expect(() =>
      assertUrlAllowed('https://example.com/path', { allow: ['example.com'] }),
    ).not.toThrow();
  });

  test('denied hostname string → ToolError', () => {
    expect(() => assertUrlAllowed('https://evil.com/', { deny: ['evil.com'] })).toThrow(ToolError);
  });

  test('URL not in allow list → ToolError', () => {
    expect(() => assertUrlAllowed('https://other.com/', { allow: ['example.com'] })).toThrow(
      ToolError,
    );
  });

  test('deny takes precedence over allow (same hostname)', () => {
    expect(() =>
      assertUrlAllowed('https://example.com/', {
        allow: ['example.com'],
        deny: ['example.com'],
      }),
    ).toThrow(ToolError);
  });

  test('RegExp matches against full URL string', () => {
    expect(() =>
      assertUrlAllowed('https://a.com/api/v1', { allow: [/^https:\/\/a\.com\/api\//] }),
    ).not.toThrow();
    expect(() =>
      assertUrlAllowed('https://a.com/other', { allow: [/^https:\/\/a\.com\/api\//] }),
    ).toThrow(ToolError);
  });

  test('no allow/deny → all URLs permitted', () => {
    expect(() => assertUrlAllowed('https://anywhere.test/foo', {})).not.toThrow();
    expect(() => assertUrlAllowed('https://elsewhere.test/', {})).not.toThrow();
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
      const out = await tool.execute(
        { url: 'https://example.com/' },
        ctx(new AbortController().signal),
      );
      const parsed = JSON.parse(out) as {
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

  test('AbortSignal: already-aborted throws before fetching', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => new Response('no'));
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const ac = new AbortController();
      ac.abort();
      const tool = fetchTool();
      await expect(tool.execute({ url: 'https://example.com/' }, ctx(ac.signal))).rejects.toThrow(
        'aborted',
      );
      expect(fetchMock).not.toHaveBeenCalled();
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
      const u = typeof input === 'string' ? input : input.url;
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
      const out = await tool.execute(
        { url: 'https://a.com/start' },
        ctx(new AbortController().signal),
      );
      const parsed = JSON.parse(out) as { status: number; body: string };
      expect(parsed.status).toBe(200);
      expect(parsed.body).toBe('final');
      expect(call).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('redirect to disallowed host → ToolError', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://blocked.com/' },
      });
    }) as typeof fetch;

    try {
      const tool = fetchTool({ allow: ['safe.com'] });
      await expect(
        tool.execute({ url: 'https://safe.com/here' }, ctx(new AbortController().signal)),
      ).rejects.toThrow(ToolError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('redirect chain exceeding max depth → ToolError', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input) => {
      const u = typeof input === 'string' ? input : input.url;
      return new Response(null, {
        status: 302,
        headers: { Location: `${u}?n=1` },
      });
    }) as typeof fetch;

    try {
      const tool = fetchTool({ allow: ['example.com'] });
      await expect(
        tool.execute({ url: 'https://example.com/loop' }, ctx(new AbortController().signal)),
      ).rejects.toThrow(/Too many redirects/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('optional live fetch', () => {
  test.skipIf(!process.env.HARNESS_FETCH_LIVE)('live GET (set HARNESS_FETCH_LIVE=1)', async () => {
    const tool = fetchTool();
    const out = await tool.execute(
      { url: 'https://httpbin.org/get', method: 'GET' },
      ctx(new AbortController().signal),
    );
    const parsed = JSON.parse(out) as { status: number; body: string };
    expect(parsed.status).toBe(200);
    expect(parsed.body.length).toBeGreaterThan(0);
  });
});
