import { tool } from '@harness/agent';
import { z } from 'zod';

type TimeResult =
  | { ok: true; iso: string; unix: number; timezone: string; formatted: string }
  | { ok: false; error: string };

export const getTimeTool = tool<{ timezone?: string | undefined }, TimeResult>({
  name: 'get_time',
  description: 'Get the current time in a given IANA timezone (defaults to UTC).',
  parameters: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone, e.g. "America/New_York". Defaults to UTC.'),
  }),
  async execute({ timezone }) {
    const tz = timezone ?? 'UTC';

    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return { ok: false, error: `Invalid timezone: "${tz}"` };
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
      ok: true,
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      timezone: tz,
      formatted,
    };
  },
});
