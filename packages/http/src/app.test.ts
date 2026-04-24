import { describe, expect, test } from 'bun:test';
import { NotFoundError, ValidationError } from '@harness/core';
import { createHttpApp } from './app.ts';
import { createFakeHttpDeps } from './testing.ts';

describe('createHttpApp', () => {
  test('GET /health returns 200 with ok status', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  test('unknown route returns 404', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });

  test('error handler maps AppError to correct status', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    app.get('/test-validation', () => {
      throw new ValidationError('bad input');
    });
    app.get('/test-not-found', () => {
      throw new NotFoundError('Thing', '123');
    });

    const res1 = await app.request('/test-validation');
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error.code).toBe('VALIDATION_ERROR');
    expect(body1.error.message).toBe('bad input');

    const res2 = await app.request('/test-not-found');
    expect(res2.status).toBe(404);
    const body2 = await res2.json();
    expect(body2.error.code).toBe('NOT_FOUND');
  });

  test('error handler returns 500 for non-AppError', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    app.get('/test-crash', () => {
      throw new Error('kaboom');
    });

    const res = await app.request('/test-crash');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
  });

  test('sets X-Request-ID header on responses', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/health');
    const reqId = res.headers.get('x-request-id');
    expect(reqId).toBeDefined();
    expect(reqId?.length).toBeGreaterThan(0);
  });

  test('rejects oversized bodies with 413', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    app.post('/test-body', async (c) => {
      await c.req.json();
      return c.json({ ok: true });
    });

    const largeBody = 'x'.repeat(2 * 1024 * 1024);
    const res = await app.request('/test-body', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(largeBody.length) },
      body: largeBody,
    });
    expect(res.status).toBe(413);
  });

  test('supports basePath config', async () => {
    const app = createHttpApp(createFakeHttpDeps(), { basePath: '/v1' });
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
  });
});
