import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'echo-test', version: '1.0.0' });

server.tool('echo', 'Echoes the input', { message: z.string() }, async (args) => ({
  content: [{ type: 'text', text: args.message }],
}));

server.tool('add', 'Adds two numbers', { a: z.number(), b: z.number() }, async (args) => ({
  content: [{ type: 'text', text: String(args.a + args.b) }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
