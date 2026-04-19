import { describe, expect, it } from 'bun:test';
import { loadBraveSearchTools } from './mcp.ts';
import { createSearchTools } from './search.ts';

const ctx = {
  runId: 'r1',
  conversationId: 'c1',
  signal: new AbortController().signal,
};

function getFetchTool(tools: { name: string }[]) {
  const t = tools.find((t) => t.name === 'fetch');
  if (!t) {
    throw new Error('fetch tool not found');
  }
  return t as (typeof tools)[number];
}

describe('createSearchTools', () => {
  it('returns at least one tool', async () => {
    const tools = await createSearchTools();
    expect(tools.length).toBeGreaterThanOrEqual(1);
  });

  it('includes a fetch tool', async () => {
    const tools = await createSearchTools();
    expect(tools.find((t) => t.name === 'fetch')).toBeDefined();
  });

  it('fetch tool rejects plain HTTP URLs', async () => {
    const tools = await createSearchTools();
    const fetchT = getFetchTool(tools);
    await expect(fetchT.execute({ url: 'http://example.com', method: 'GET' }, ctx)).rejects.toThrow(
      /not allowed/,
    );
  });

  it('fetch tool allows HTTPS URLs', async () => {
    const tools = await createSearchTools();
    const fetchT = getFetchTool(tools);
    await expect(
      fetchT.execute({ url: 'https://httpbin.org/status/200', method: 'HEAD' }, ctx),
    ).resolves.toBeDefined();
  });

  it('returns only fetchTool when braveApiKey is not provided', async () => {
    const tools = await createSearchTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('fetch');
  });

  it('still returns fetchTool when MCP fails', async () => {
    const tools = await createSearchTools({
      braveApiKey: 'fake-key-for-test',
      signal: AbortSignal.timeout(500),
    });
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools.find((t) => t.name === 'fetch')).toBeDefined();
  }, 10_000);
});

describe('loadBraveSearchTools', () => {
  it('returns empty array when MCP connection fails', async () => {
    const tools = await loadBraveSearchTools('fake-key', AbortSignal.timeout(500));
    expect(tools).toEqual([]);
  }, 10_000);
});
