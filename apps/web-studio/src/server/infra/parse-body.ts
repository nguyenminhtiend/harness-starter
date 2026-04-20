import type { Context } from 'hono';
import type { ZodType } from 'zod';

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export async function parseJsonBody<T>(c: Context, schema: ZodType<T>): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: c.json({ error: 'Invalid JSON body' }, 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: c.json({ error: parsed.error.flatten() }, 400) };
  }
  return { ok: true, data: parsed.data };
}
