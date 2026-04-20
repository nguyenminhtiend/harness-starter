import type { Tool } from '@harness/agent';
import { fetchTool } from '@harness/tools';

const HTTPS_ONLY = /^https:\/\//;

export interface SearchToolsOpts {
  braveApiKey?: string | undefined;
  signal?: AbortSignal;
}

export async function createSearchTools(opts?: SearchToolsOpts): Promise<Tool[]> {
  const tools: Tool[] = [fetchTool({ allow: [HTTPS_ONLY] }) as Tool];

  if (opts?.braveApiKey) {
    try {
      const { mcpTools } = await import('@harness/mcp');
      const { tools: mcpToolList } = await mcpTools(
        {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@brave/brave-search-mcp-server@2.0.75'],
          env: { BRAVE_API_KEY: opts.braveApiKey },
        },
        { signal: opts.signal ?? AbortSignal.timeout(15_000) },
      );
      tools.push(...mcpToolList);
    } catch {
      // MCP not available — fetch-only fallback
    }
  }

  return tools;
}
