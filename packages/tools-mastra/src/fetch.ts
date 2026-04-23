import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

const inputSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

export type FetchUrlPolicy = {
  allow?: (string | RegExp)[];
  deny?: (string | RegExp)[];
};

function matchesEntry(urlString: string, hostname: string, entry: string | RegExp): boolean {
  if (typeof entry === 'string') {
    return hostname === entry;
  }
  return entry.test(urlString);
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^\[::1\]$/,
  /^\[fc/i,
  /^\[fd/i,
  /^\[fe80:/i,
];

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    return true;
  }
  return PRIVATE_IP_PATTERNS.some((p) => p.test(hostname));
}

export function assertUrlAllowed(urlString: string, policy: FetchUrlPolicy): void {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`URL scheme not allowed: ${parsed.protocol}`);
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`URL targets a private/reserved address: ${parsed.hostname}`);
  }

  const { allow, deny } = policy;

  if (allow != null && allow.length > 0) {
    const ok = allow.some((entry) => matchesEntry(urlString, parsed.hostname, entry));
    if (!ok) {
      throw new Error(`URL not allowed by policy: ${urlString}`);
    }
  }

  if (deny != null) {
    for (const entry of deny) {
      if (matchesEntry(urlString, parsed.hostname, entry)) {
        throw new Error(`URL denied by policy: ${urlString}`);
      }
    }
  }
}

async function readBodyCapped(res: Response): Promise<string> {
  if (!res.body) {
    return '';
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const remaining = MAX_BODY_BYTES - totalBytes;
      if (remaining <= 0) {
        break;
      }
      if (value.length > remaining) {
        chunks.push(value.subarray(0, remaining));
        totalBytes += remaining;
        break;
      }
      chunks.push(value);
      totalBytes += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function applyRedirectMethod(
  status: number,
  priorMethod: string,
  priorBody: string | undefined,
): { method: string; body: string | undefined } {
  if (status === 307 || status === 308) {
    return { method: priorMethod, body: priorBody };
  }
  return { method: 'GET', body: undefined };
}

async function fetchWithRedirectPolicy(
  startUrl: string,
  startMethod: string,
  startHeaders: Record<string, string> | undefined,
  startBody: string | undefined,
  policy: FetchUrlPolicy,
  fetchImpl: typeof fetch,
): Promise<Response> {
  let currentUrl = startUrl;
  let method = startMethod;
  let body = startBody;
  let redirects = 0;

  while (true) {
    assertUrlAllowed(currentUrl, policy);

    const init: RequestInit = {
      method,
      redirect: 'manual',
    };
    if (startHeaders !== undefined) {
      init.headers = startHeaders;
    }
    if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
      init.body = body;
    }

    const res = await fetchImpl(currentUrl, init);
    const loc = res.headers.get('Location');
    if (res.status >= 300 && res.status < 400 && loc != null) {
      if (redirects >= MAX_REDIRECTS) {
        throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
      }
      const nextUrl = new URL(loc, res.url || currentUrl).href;
      assertUrlAllowed(nextUrl, policy);
      redirects++;
      const next = applyRedirectMethod(res.status, method, body);
      method = next.method;
      body = next.body;
      currentUrl = nextUrl;
      continue;
    }

    return res;
  }
}

export function fetchTool(opts?: FetchUrlPolicy) {
  const policy: FetchUrlPolicy = opts ?? {};

  return createTool({
    id: 'fetch',
    description: 'HTTP fetch with URL policy, manual redirects (max 5), and 1MB body cap.',
    inputSchema,
    execute: async (args) => {
      const res = await fetchWithRedirectPolicy(
        args.url,
        args.method ?? 'GET',
        args.headers,
        args.body,
        policy,
        globalThis.fetch,
      );

      const text = await readBodyCapped(res);
      const payload = {
        status: res.status,
        headers: headersToRecord(res.headers),
        body: text,
      };
      return JSON.stringify(payload);
    },
  });
}
