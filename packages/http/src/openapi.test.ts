import { describe, expect, test } from 'bun:test';
import { createHttpApp } from './app.ts';
import { createFakeHttpDeps } from './testing.ts';

function getApp() {
  return createHttpApp(createFakeHttpDeps());
}

async function fetchSpec() {
  const app = getApp();
  const res = await app.request('/openapi.json');
  expect(res.status).toBe(200);
  return res.json();
}

describe('GET /openapi.json', () => {
  test('returns a valid OpenAPI 3.1 document', async () => {
    const spec = await fetchSpec();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('Harness API');
    expect(spec.info.version).toBe('0.0.1');
  });

  test('every declared route appears in the spec', async () => {
    const spec = await fetchSpec();
    const specPaths = Object.keys(spec.paths);

    const expected = [
      '/health',
      '/capabilities',
      '/capabilities/{id}',
      '/runs',
      '/runs/{id}/approve',
      '/runs/{id}/reject',
      '/settings',
      '/conversations',
      '/conversations/{id}',
      '/conversations/{id}/messages',
      '/models',
    ];

    for (const path of expected) {
      expect(specPaths).toContain(path);
    }
  });

  test('POST /runs has requestBody schema', async () => {
    const spec = await fetchSpec();
    const postRuns = spec.paths['/runs']?.post;
    expect(postRuns).toBeDefined();
    expect(postRuns.requestBody?.content?.['application/json']?.schema).toBeDefined();
  });

  test('content-type is application/json', async () => {
    const app = getApp();
    const res = await app.request('/openapi.json');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('GET /docs', () => {
  test('returns HTML with Scalar reference', async () => {
    const app = getApp();
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('scalar');
  });
});
