import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const successSchema = z.object({
  ok: z.literal(true),
  iso: z.string(),
  unix: z.number(),
  timezone: z.string(),
  formatted: z.string(),
});

const errorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export const getTimeTool = createTool({
  id: 'get_time',
  description: 'Get the current time in a given IANA timezone (defaults to UTC).',
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone, e.g. "America/New_York". Defaults to UTC.'),
  }),
  outputSchema: z.discriminatedUnion('ok', [successSchema, errorSchema]),
  execute: async (inputData) => {
    const tz = inputData.timezone ?? 'UTC';

    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return { ok: false as const, error: `Invalid timezone: "${tz}"` };
    }

    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'long',
    });

    return {
      ok: true as const,
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      timezone: tz,
      formatted,
    };
  },
});
