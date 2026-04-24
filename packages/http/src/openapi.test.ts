import { describe, expect, test } from 'bun:test';
import { createHttpApp } from './app.ts';
import { buildOpenApiSpec } from './openapi.ts';
import { createFakeHttpDeps } from './testing.ts';

const EXPECTED_PATHS = [
  '/health',
  '/capabilities',
  '/capabilities/{id}',
  '/runs',
  '/runs/{id}',
  '/runs/{id}/cancel',
  '/runs/{id}/events',
  '/runs/{id}/approve',
  '/runs/{id}/reject',
  '/settings',
  '/conversations',
  '/conversations/{id}',
  '/conversations/{id}/messages',
  '/models',
];

describe('buildOpenApiSpec', () => {
  test('produces a valid OpenAPI 3.1 document', () => {
    const spec = buildOpenApiSpec();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBeDefined();
    expect(spec.info.version).toBeDefined();
    expect(spec.paths).toBeDefined();
  });

  test('every expected route exists in the spec', () => {
    const spec = buildOpenApiSpec();
    const specPaths = Object.keys(spec.paths);

    for (const path of EXPECTED_PATHS) {
      expect(specPaths).toContain(path);
    }
  });

  test('each path has at least one operation', () => {
    const spec = buildOpenApiSpec();
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];

    for (const [_path, ops] of Object.entries(spec.paths)) {
      const methods = Object.keys(ops as Record<string, unknown>).filter((k) =>
        httpMethods.includes(k),
      );
      expect(methods.length).toBeGreaterThan(0);
    }
  });

  test('POST /runs has requestBody with required schema', () => {
    const spec = buildOpenApiSpec();
    const postRuns = spec.paths['/runs']?.post;
    expect(postRuns).toBeDefined();
    expect(postRuns.requestBody?.content?.['application/json']?.schema).toBeDefined();
  });

  test('SSE endpoint documents text/event-stream response', () => {
    const spec = buildOpenApiSpec();
    const getEvents = spec.paths['/runs/{id}/events']?.get;
    expect(getEvents).toBeDefined();
    const responses = getEvents.responses;
    expect(responses['200']?.content?.['text/event-stream']).toBeDefined();
  });
});

describe('GET /openapi.json', () => {
  test('returns the OpenAPI spec', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.paths).toBeDefined();
  });
});

describe('GET /docs', () => {
  test('returns HTML with Scalar reference', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('scalar');
  });
});
