import pino from 'pino';
import type { Logger } from '../domain/capability.ts';

export type { Logger } from '../domain/capability.ts';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function wrapPino(p: pino.Logger): Logger {
  const logAt =
    (level: LogLevel) =>
    (msg: string, data?: Record<string, unknown>): void => {
      if (data) {
        p[level](data, msg);
      } else {
        p[level](msg);
      }
    };

  return {
    debug: logAt('debug'),
    info: logAt('info'),
    warn: logAt('warn'),
    error: logAt('error'),
    child: (bindings) => wrapPino(p.child(bindings)),
  };
}

export function createPinoLogger(opts?: { level?: string }): Logger {
  const p = pino({ level: opts?.level ?? 'info' });
  return wrapPino(p);
}
