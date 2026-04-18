import { describe, expect, test } from 'bun:test';
import { mcpTools } from './mcp-tools.ts';
import type { McpClientConfig } from './types.ts';

const echoServerPath = new URL('./test-fixtures/echo-server.ts', import.meta.url).pathname;

function stdioConfig(): McpClientConfig {
  return { transport: 'stdio', command: 'bun', args: [echoServerPath] };
}

describe('mcpTools', () => {
  test('discovers tools from an MCP stdio server', async () => {
    const { tools, close } = await mcpTools(stdioConfig());
    try {
      expect(tools.length).toBeGreaterThan(0);
      const echoTool = tools.find((t) => t.name === 'echo');
      expect(echoTool).toBeDefined();
      expect(echoTool?.description).toBe('Echoes the input');
    } finally {
      await close();
    }
  });

  test('allow filter includes only named tools', async () => {
    const { tools, close } = await mcpTools(stdioConfig(), { allow: ['echo'] });
    try {
      expect(tools.length).toBe(1);
      expect(tools[0]?.name).toBe('echo');
    } finally {
      await close();
    }
  });

  test('deny filter excludes named tools', async () => {
    const { tools, close } = await mcpTools(stdioConfig(), { deny: ['echo'] });
    try {
      expect(tools.find((t) => t.name === 'echo')).toBeUndefined();
      expect(tools.find((t) => t.name === 'add')).toBeDefined();
    } finally {
      await close();
    }
  });

  test('tool execution round-trips through the MCP server', async () => {
    const { tools, close } = await mcpTools(stdioConfig());
    try {
      const echoTool = tools.find((t) => t.name === 'echo');
      if (!echoTool) {
        throw new Error('echo tool not found');
      }
      const result = await echoTool.execute(
        { message: 'hello' },
        { runId: 'r1', conversationId: 'c1', signal: AbortSignal.timeout(10000) },
      );
      expect(result).toBe('hello');
    } finally {
      await close();
    }
  });
});
