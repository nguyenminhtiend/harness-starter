import type { Tool } from '@harness/agent';
import { fetchTool } from '@harness/tools';
import { loadBraveSearchTools } from './mcp.ts';

const HTTPS_ONLY = /^https:\/\//;

export interface SearchToolsOpts {
  braveApiKey?: string;
  signal?: AbortSignal;
}

export async function createSearchTools(opts?: SearchToolsOpts): Promise<Tool[]> {
  const tools: Tool[] = [fetchTool({ allow: [HTTPS_ONLY] }) as Tool];

  if (opts?.braveApiKey) {
    const mcpTools = await loadBraveSearchTools(opts.braveApiKey, opts.signal);
    tools.push(...mcpTools);
  }

  return tools;
}
