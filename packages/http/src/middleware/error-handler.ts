import type { Logger } from '@harness/core';
import { AppError } from '@harness/core';
import type { Context, ErrorHandler } from 'hono';

export function errorHandler(logger?: Logger): ErrorHandler {
  return (err: Error, c: Context) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as 400);
    }

    if (logger) {
      logger.error('unhandled error', {
        path: c.req.path,
        method: c.req.method,
        error: err.message,
        stack: err.stack,
      });
    }

    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  };
}
