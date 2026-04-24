import { describe, expect, test } from 'bun:test';
import type { CapabilityEvent, ExecutionContext } from '@harness/core';
import { z } from 'zod';
import { createHttpApp } from '../app.ts';
import { createFakeHttpDeps } from '../testing.ts';

function fakeCapability(id = 'test-cap'): Capability {
  return {
    id,
    title: 'Test Capability',
    description: 'A test capability',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ text: z.string() }),
    settingsSchema: z.object({ model: z.string() }),
    async *execute(_input: unknown, _ctx: ExecutionContext): AsyncIterable<CapabilityEvent> {
      yield { type: 'text-delta', text: 'hello' };
    },
  };
}

function depsWithCapability() {
  const cap = fakeCapability('simple-chat');
  return createFakeHttpDeps({
    capabilityRegistry: {
      list: () => [cap],
      get: (id) => (id === 'simple-chat' ? cap : undefined),
    },
  });
}

describe('GET /health', () => {
  test('returns ok', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /capabilities', () => {
  test('returns list of capabilities', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);
    const res = await app.request('/capabilities');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('simple-chat');
    expect(body[0].title).toBe('Test Capability');
    expect(body[0].supportsApproval).toBe(false);
  });
});

describe('GET /capabilities/:id', () => {
  test('returns capability detail', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);
    const res = await app.request('/capabilities/simple-chat');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('simple-chat');
    expect(body.inputSchema).toBeDefined();
    expect(body.settingsSchema).toBeDefined();
  });

  test('returns 404 for unknown capability', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);
    const res = await app.request('/capabilities/unknown');
    expect(res.status).toBe(404);
  });
});

describe('POST /runs', () => {
  test('creates a run and returns runId', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);
    const res = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.runId).toBeDefined();
    expect(typeof body.runId).toBe('string');
  });

  test('returns 404 for unknown capability', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);
    const res = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'nonexistent',
        input: {},
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /runs/:id', () => {
  test('returns run data', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);

    const createRes = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
      }),
    });
    const { runId } = await createRes.json();

    const res = await app.request(`/runs/${runId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(runId);
    expect(body.capabilityId).toBe('simple-chat');
  });

  test('returns 404 for unknown run', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/runs/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /runs/:id/cancel', () => {
  test('cancels a running run', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);

    const createRes = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
      }),
    });
    const { runId } = await createRes.json();

    const res = await app.request(`/runs/${runId}/cancel`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  test('returns 404 for unknown run', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/runs/nonexistent/cancel', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /runs/:id', () => {
  test('deletes a run', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);

    const createRes = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
      }),
    });
    const { runId } = await createRes.json();

    const res = await app.request(`/runs/${runId}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const getRes = await app.request(`/runs/${runId}`);
    expect(getRes.status).toBe(404);
  });
});

describe('GET /runs/:id/events (SSE)', () => {
  test('streams events with correct SSE format', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);

    const createRes = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
      }),
    });
    const { runId } = await createRes.json();

    await new Promise((r) => setTimeout(r, 50));

    const res = await app.request(`/runs/${runId}/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const text = await res.text();
    expect(text).toContain('event: session');
    expect(text).toContain('run.started');
  });

  test('Last-Event-ID resumes from correct seq', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);

    const createRes = await app.request('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capabilityId: 'simple-chat',
        input: { message: 'hi' },
      }),
    });
    const { runId } = await createRes.json();

    await new Promise((r) => setTimeout(r, 50));

    const res = await app.request(`/runs/${runId}/events`, {
      headers: { 'last-event-id': '3' },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.startsWith('id: '));
    for (const line of lines) {
      const seq = Number.parseInt(line.replace('id: ', ''), 10);
      expect(seq).toBeGreaterThanOrEqual(4);
    }
  });
});
