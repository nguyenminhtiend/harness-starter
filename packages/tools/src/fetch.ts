import type { Tool, ToolContext } from '@harness/agent';
import { tool } from '@harness/agent';
import { assertNotAborted, ToolError } from '@harness/core';
import { z } from 'zod';

/**
 * Known v1 limitation: this tool does not resolve hostnames to IPs before policy
 * checks, so DNS rebinding could theoretically bypass hostname allow/deny lists.
 * For untrusted agents, prefer deny-listing private IP ranges at the network layer.
 */

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

const parameters = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

type FetchArgs = z.infer<typeof parameters>;

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

/** Exported for unit tests of URL policy matching. */
export function assertUrlAllowed(urlString: string, policy: FetchUrlPolicy): void {
  let hostname: string;
  try {
    hostname = new URL(urlString).hostname;
  } catch {
    throw new ToolError(`Invalid URL: ${urlString}`, { toolName: 'fetch' });
  }

  const { allow, deny } = policy;

  if (allow != null && allow.length > 0) {
    const ok = allow.some((entry) => matchesEntry(urlString, hostname, entry));
    if (!ok) {
      throw new ToolError(`URL not allowed by policy: ${urlString}`, { toolName: 'fetch' });
    }
  }

  if (deny != null) {
    for (const entry of deny) {
      if (matchesEntry(urlString, hostname, entry)) {
        throw new ToolError(`URL denied by policy: ${urlString}`, { toolName: 'fetch' });
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
  if (status === 303) {
    return { method: 'GET', body: undefined };
  }
  return { method: 'GET', body: undefined };
}

async function fetchWithRedirectPolicy(
  startUrl: string,
  startMethod: string,
  startHeaders: Record<string, string> | undefined,
  startBody: string | undefined,
  ctx: ToolContext,
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
      signal: ctx.signal,
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
        throw new ToolError(`Too many redirects (max ${MAX_REDIRECTS})`, { toolName: 'fetch' });
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

export function fetchTool(opts?: FetchUrlPolicy): Tool<FetchArgs, string> {
  const policy: FetchUrlPolicy = opts ?? {};

  return tool({
    name: 'fetch',
    description: 'HTTP fetch with URL policy, manual redirects (max 5), and 1MB body cap.',
    parameters,
    execute: async (args, ctx) => {
      assertNotAborted(ctx.signal);
      const parsed = parameters.parse(args);

      const res = await fetchWithRedirectPolicy(
        parsed.url,
        parsed.method,
        parsed.headers,
        parsed.body,
        ctx,
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
