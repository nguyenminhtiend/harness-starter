import { createMiddleware } from 'hono/factory';

export function requestId() {
  return createMiddleware(async (c, next) => {
    const id = crypto.randomUUID();
    c.set('requestId', id);
    c.header('X-Request-ID', id);
    await next();
  });
}
