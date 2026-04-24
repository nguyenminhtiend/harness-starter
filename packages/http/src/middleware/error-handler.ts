import { AppError } from '@harness/core';
import type { Context, ErrorHandler } from 'hono';

export function errorHandler(): ErrorHandler {
  return (err: Error, c: Context) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as 400);
    }

    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  };
}
