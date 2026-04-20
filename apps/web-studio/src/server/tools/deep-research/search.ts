import type { Tool } from '@harness/agent';
import { fetchTool } from '@harness/tools';

const HTTPS_ONLY = /^https:\/\//;

export interface SearchToolsOpts {
  signal?: AbortSignal;
}

export async function createSearchTools(opts?: SearchToolsOpts): Promise<Tool[]> {
  return [fetchTool({ allow: [HTTPS_ONLY] }) as Tool];
}
