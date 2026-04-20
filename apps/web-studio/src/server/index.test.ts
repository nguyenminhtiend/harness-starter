import { describe, expect, it } from 'bun:test';
import { createApp } from './index.ts';

describe('web-studio server', () => {
  it('GET /api/health returns 200 with ok status', async () => {
    const app = createApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('GET /api/tools returns 200', async () => {
    const app = createApp();
    const res = await app.request('/api/tools');
    expect(res.status).toBe(200);
  });

  it('GET /api/runs returns 200', async () => {
    const app = createApp();
    const res = await app.request('/api/runs');
    expect(res.status).toBe(200);
  });

  it('GET /api/settings returns 200', async () => {
    const app = createApp();
    const res = await app.request('/api/settings');
    expect(res.status).toBe(200);
  });
});
