import type { Logger } from '@harness/core';
import { createMiddleware } from 'hono/factory';

export function accessLogger(logger: Logger) {
  return createMiddleware(async (c, next) => {
    const start = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - start);
    const status = c.res.status;

    const data: Record<string, unknown> = {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
    };

    const requestId = c.get('requestId');
    if (requestId) {
      data.requestId = requestId;
    }

    if (status >= 500) {
      logger.error(data, 'request');
    } else if (status >= 400) {
      logger.warn(data, 'request');
    } else {
      logger.info(data, 'request');
    }
  });
}
