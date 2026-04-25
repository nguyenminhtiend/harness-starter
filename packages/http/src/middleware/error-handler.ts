import type { Logger } from '@harness/core';
import { AppError } from '@harness/core';
import type { Context, ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

const SAFE_5XX_MESSAGES: Record<string, string> = {
  CAPABILITY_EXECUTION_ERROR: 'Capability execution failed',
  EXTERNAL_SERVICE_ERROR: 'External service unavailable',
};

export function errorHandler(logger?: Logger): ErrorHandler {
  return (err: Error, c: Context) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const message = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input';
      return c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400);
    }

    if (err instanceof AppError) {
      if (logger && err.statusCode >= 500) {
        logger.error(
          {
            path: c.req.path,
            method: c.req.method,
            code: err.code,
            error: err.message,
            stack: err.stack,
          },
          'server error',
        );
      }

      const message =
        err.statusCode >= 500
          ? (SAFE_5XX_MESSAGES[err.code] ?? 'Internal server error')
          : err.message;
      return c.json({ error: { code: err.code, message } }, err.statusCode as ContentfulStatusCode);
    }

    if (logger) {
      logger.error(
        { path: c.req.path, method: c.req.method, error: err.message, stack: err.stack },
        'unhandled error',
      );
    }

    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  };
}
