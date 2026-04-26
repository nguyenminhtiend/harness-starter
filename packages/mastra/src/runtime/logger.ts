import type { LogLevel } from '@mastra/loggers';
import { PinoLogger } from '@mastra/loggers';

export interface CreateMastraLoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
}

export function createMastraLogger(opts?: CreateMastraLoggerOptions): PinoLogger {
  return new PinoLogger({
    level: opts?.level ?? 'info',
    prettyPrint: opts?.pretty ?? process.env.NODE_ENV !== 'production',
  });
}
