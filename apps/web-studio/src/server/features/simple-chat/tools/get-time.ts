import { tool } from '@harness/agent';
import { z } from 'zod';

interface TimeResult {
  iso: string;
  unix: number;
  timezone: string;
  formatted: string;
  error?: undefined;
}

interface TimeError {
  error: string;
  iso?: undefined;
  unix?: undefined;
  timezone?: undefined;
  formatted?: undefined;
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const getTimeTool = tool<{ timezone?: string | undefined }, TimeResult | TimeError>({
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

    if (!isValidTimezone(tz)) {
      return { error: `Invalid timezone: "${tz}"` };
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
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      timezone: tz,
      formatted,
    };
  },
});
