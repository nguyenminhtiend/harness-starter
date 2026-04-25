import type { IMastraLogger } from '@mastra/core/logger';
import pino from 'pino';

export type Logger = pino.Logger;
export type MastraLogger = IMastraLogger;

const DEFAULT_REDACT_PATHS = [
  '*.apiKey',
  '*.authorization',
  '*.cookie',
  '*.password',
  'req.headers.authorization',
];

export function previewText(s: string, max = 300): string {
  if (s.length <= max) {
    return s;
  }
  const dropped = s.length - max;
  return `${s.slice(0, max)}…[+${dropped} more]`;
}

export interface PreviewMessage {
  role: string;
  preview: string;
}

export function previewMessages(msgs: Array<{ role: string; content: unknown }>): PreviewMessage[] {
  return msgs.map((m) => ({
    role: m.role,
    preview: previewText(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
  }));
}

export function createPinoLogger(opts?: {
  level?: string;
  pretty?: boolean;
  redact?: string[];
}): Logger {
  const level = opts?.level ?? 'info';
  const redact = opts?.redact ?? DEFAULT_REDACT_PATHS;

  if (opts?.pretty) {
    try {
      return pino({ level, redact, transport: { target: 'pino-pretty' } });
    } catch {
      // pino-pretty not installed — fall back to plain JSON
    }
  }
  return pino({ level, redact });
}
