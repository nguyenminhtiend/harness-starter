import type { Tool } from '@harness/agent';

/**
 * Dynamically loads Brave Search tools via MCP.
 * Returns [] if @harness/mcp isn't installed or the server can't connect.
 */
export async function loadBraveSearchTools(apiKey: string, signal?: AbortSignal): Promise<Tool[]> {
  try {
    const { mcpTools } = await import('@harness/mcp');
    const { tools } = await mcpTools(
      {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@anthropic/brave-search-mcp'],
        env: { BRAVE_API_KEY: apiKey },
      },
      { signal: signal ?? AbortSignal.timeout(15_000) },
    );
    return tools;
  } catch {
    return [];
  }
}
