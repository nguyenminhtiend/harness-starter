import type { Tool } from '@harness/agent';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { convertMcpTool, type McpToolDef } from './adapter.ts';
import type { McpClientConfig, McpToolsOptions } from './types.ts';

export interface McpToolsResult {
  tools: Tool[];
  close: () => Promise<void>;
}

function createTransport(config: McpClientConfig) {
  switch (config.transport) {
    case 'stdio': {
      const params: { command: string; args?: string[]; env?: Record<string, string> } = {
        command: config.command,
      };
      if (config.args) {
        params.args = config.args;
      }
      if (config.env) {
        params.env = config.env;
      }
      return new StdioClientTransport(params);
    }
    case 'http': {
      const opts: { requestInit?: RequestInit } = {};
      if (config.headers) {
        opts.requestInit = { headers: config.headers };
      }
      return new StreamableHTTPClientTransport(new URL(config.url), opts);
    }
    default:
      throw new Error(`Unsupported transport: ${(config as { transport: string }).transport}`);
  }
}

export async function mcpTools(
  config: McpClientConfig,
  opts?: McpToolsOptions & { signal?: AbortSignal },
): Promise<McpToolsResult> {
  const client = new Client({ name: 'harness-mcp', version: '1.0.0' });
  const transport = createTransport(config);

  const connectPromise = client.connect(transport as Parameters<typeof client.connect>[0]);
  if (opts?.signal) {
    await Promise.race([
      connectPromise,
      new Promise<never>((_, reject) => {
        if (opts.signal?.aborted) {
          reject(new DOMException('MCP connect aborted', 'AbortError'));
          return;
        }
        opts.signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('MCP connect aborted', 'AbortError'));
          },
          { once: true },
        );
      }),
    ]);
  } else {
    await connectPromise;
  }

  const { tools: mcpToolDefs } = await client.listTools();

  let filtered = mcpToolDefs;
  if (opts?.allow) {
    const allowed = new Set(opts.allow);
    filtered = filtered.filter((t) => allowed.has(t.name));
  }
  if (opts?.deny) {
    const denied = new Set(opts.deny);
    filtered = filtered.filter((t) => !denied.has(t.name));
  }

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    return result as {
      content: { type: string; text?: string; [key: string]: unknown }[];
      isError?: boolean;
    };
  };

  const tools = filtered.map((t) => convertMcpTool(t as McpToolDef, callTool));

  const close = async () => {
    await client.close();
  };

  return { tools, close };
}
