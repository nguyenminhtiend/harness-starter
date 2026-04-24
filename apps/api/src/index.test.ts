import { describe, expect, test } from 'bun:test';
import { compose } from './compose.ts';

function createTestApp() {
  return compose({ port: 0, host: '127.0.0.1', logLevel: 'error' });
}

describe('apps/api integration', () => {
  test('GET /health returns ok', async () => {
    const { app } = createTestApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('GET /capabilities lists simple-chat', async () => {
    const { app } = createTestApp();
    const res = await app.request('/capabilities');
    expect(res.status).toBe(200);
    const caps = await res.json();
    expect(caps.some((c: { id: string }) => c.id === 'simple-chat')).toBe(true);
  });

  test('POST /runs creates a run for simple-chat', async () => {
    const { app } = createTestApp();
    const res = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
        settings: { model: 'test-model' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.runId).toBeDefined();
  });

  test('POST /runs → GET /runs/:id/events streams run.started and terminal event', async () => {
    const { app } = createTestApp();

    const createRes = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
        settings: { model: 'test-model' },
      }),
    });
    const { runId } = await createRes.json();

    await new Promise((r) => setTimeout(r, 100));

    const sseRes = await app.request(`/runs/${runId}/events`);
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toBe('text/event-stream');

    const text = await sseRes.text();
    expect(text).toContain('run.started');
    const hasTerminal =
      text.includes('run.completed') ||
      text.includes('run.failed') ||
      text.includes('run.cancelled');
    expect(hasTerminal).toBe(true);
  });
});
