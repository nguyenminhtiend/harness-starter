import { describe, expect, test } from 'bun:test';
import { convertMcpTool } from './adapter.ts';

const fakeMcpTool = {
  name: 'get_weather',
  description: 'Get weather for a city',
  inputSchema: {
    type: 'object' as const,
    properties: {
      city: { type: 'string', description: 'City name' },
    },
    required: ['city'],
  },
};

describe('convertMcpTool', () => {
  test('produces a Tool with correct name and description', () => {
    const callTool = async () => ({ content: [{ type: 'text' as const, text: 'Sunny' }] });
    const harnessTool = convertMcpTool(fakeMcpTool, callTool);
    expect(harnessTool.name).toBe('get_weather');
    expect(harnessTool.description).toBe('Get weather for a city');
  });

  test('parameters validate required fields', () => {
    const callTool = async () => ({ content: [{ type: 'text' as const, text: 'ok' }] });
    const harnessTool = convertMcpTool(fakeMcpTool, callTool);
    expect(harnessTool.parameters.safeParse({ city: 'NYC' }).success).toBe(true);
    expect(harnessTool.parameters.safeParse({}).success).toBe(false);
  });

  test('execute calls callTool and returns text content', async () => {
    const callTool = async (_name: string, args: Record<string, unknown>) => ({
      content: [{ type: 'text' as const, text: `Weather in ${args.city}: Sunny` }],
    });
    const harnessTool = convertMcpTool(fakeMcpTool, callTool);
    const result = await harnessTool.execute(
      { city: 'NYC' },
      { runId: 'r1', conversationId: 'c1', signal: AbortSignal.timeout(5000) },
    );
    expect(result).toBe('Weather in NYC: Sunny');
  });

  test('execute concatenates multiple text content parts', async () => {
    const callTool = async () => ({
      content: [
        { type: 'text' as const, text: 'Part 1. ' },
        { type: 'text' as const, text: 'Part 2.' },
      ],
    });
    const harnessTool = convertMcpTool(fakeMcpTool, callTool);
    const result = await harnessTool.execute(
      { city: 'X' },
      { runId: 'r1', conversationId: 'c1', signal: AbortSignal.timeout(5000) },
    );
    expect(result).toBe('Part 1. Part 2.');
  });

  test('execute returns JSON for non-text content', async () => {
    const callTool = async () => ({
      content: [{ type: 'image' as const, data: 'base64...', mimeType: 'image/png' }],
    });
    const harnessTool = convertMcpTool(fakeMcpTool, callTool);
    const result = await harnessTool.execute(
      { city: 'X' },
      { runId: 'r1', conversationId: 'c1', signal: AbortSignal.timeout(5000) },
    );
    const parsed = JSON.parse(result as string);
    expect(parsed).toEqual([{ type: 'image', data: 'base64...', mimeType: 'image/png' }]);
  });

  test('execute throws ToolError when callTool result isError', async () => {
    const callTool = async () => ({
      content: [{ type: 'text' as const, text: 'Something went wrong' }],
      isError: true,
    });
    const harnessTool = convertMcpTool(fakeMcpTool, callTool);
    await expect(
      harnessTool.execute(
        { city: 'X' },
        { runId: 'r1', conversationId: 'c1', signal: AbortSignal.timeout(5000) },
      ),
    ).rejects.toThrow('Something went wrong');
  });

  test('handles tool with no inputSchema gracefully', () => {
    const noSchema = { name: 'ping', description: 'Ping' };
    const callTool = async () => ({ content: [{ type: 'text' as const, text: 'pong' }] });
    const harnessTool = convertMcpTool(noSchema as typeof fakeMcpTool, callTool);
    expect(harnessTool.parameters.safeParse({}).success).toBe(true);
  });
});
