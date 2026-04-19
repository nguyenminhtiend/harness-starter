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
        args: ['-y', '@brave/brave-search-mcp-server@2.0.75'],
        env: { BRAVE_API_KEY: apiKey },
      },
      { signal: signal ?? AbortSignal.timeout(15_000) },
    );
    return tools;
  } catch {
    return [];
  }
}
