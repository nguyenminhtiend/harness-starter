import pino from 'pino';

export type Logger = pino.Logger;

export function createPinoLogger(opts?: { level?: string }): Logger {
  return pino({ level: opts?.level ?? 'info' });
}
