import type { Tool, ToolContext } from '@harness/agent';
import { tool } from '@harness/agent';
import { ToolError } from '@harness/core';
import { z } from 'zod';
import { type JsonSchema, jsonSchemaToZod } from './json-schema-to-zod.ts';

export interface McpToolDef {
  name: string;
  description?: string | undefined;
  inputSchema?: JsonSchema | undefined;
  [key: string]: unknown;
}

interface McpContentPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface McpCallResult {
  content: McpContentPart[];
  isError?: boolean;
}

export type CallToolFn = (name: string, args: Record<string, unknown>) => Promise<McpCallResult>;

function extractText(content: McpContentPart[]): { allText: boolean; text: string } {
  const textParts = content.filter((c) => c.type === 'text' && c.text != null);
  if (textParts.length === content.length && textParts.length > 0) {
    return { allText: true, text: textParts.map((c) => c.text).join('') };
  }
  return { allText: false, text: JSON.stringify(content) };
}

export function convertMcpTool(mcpTool: McpToolDef, callTool: CallToolFn): Tool {
  const parameters = mcpTool.inputSchema
    ? jsonSchemaToZod(mcpTool.inputSchema)
    : z.object({}).passthrough();

  return tool({
    name: mcpTool.name,
    description: mcpTool.description ?? '',
    parameters,
    async execute(args: unknown, _ctx: ToolContext): Promise<string> {
      const result = await callTool(mcpTool.name, (args ?? {}) as Record<string, unknown>);
      const { text } = extractText(result.content);

      if (result.isError) {
        throw new ToolError(text || 'MCP tool returned an error', {
          toolName: mcpTool.name,
        });
      }

      return text;
    },
  }) as Tool;
}
