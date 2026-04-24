import { createMiddleware } from 'hono/factory';

const DEFAULT_MAX_BYTES = 1024 * 1024;

export function bodyLimit(maxBytes = DEFAULT_MAX_BYTES) {
  return createMiddleware(async (c, next) => {
    const cl = c.req.header('content-length');
    if (cl && Number.parseInt(cl, 10) > maxBytes) {
      return c.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } },
        413,
      );
    }
    await next();
  });
}
