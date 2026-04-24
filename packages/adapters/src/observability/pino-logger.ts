import type { Logger } from '@harness/core';
import pino from 'pino';

function wrapPino(p: pino.Logger): Logger {
  return {
    debug(msg, data) {
      if (data) {
        p.debug(data, msg);
      } else {
        p.debug(msg);
      }
    },
    info(msg, data) {
      if (data) {
        p.info(data, msg);
      } else {
        p.info(msg);
      }
    },
    warn(msg, data) {
      if (data) {
        p.warn(data, msg);
      } else {
        p.warn(msg);
      }
    },
    error(msg, data) {
      if (data) {
        p.error(data, msg);
      } else {
        p.error(msg);
      }
    },
    child(bindings) {
      return wrapPino(p.child(bindings));
    },
  };
}

export function createPinoLogger(opts?: { level?: string }): Logger {
  const p = pino({ level: opts?.level ?? 'info' });
  return wrapPino(p);
}
