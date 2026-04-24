import { describe, expect, test } from 'bun:test';
import type { CapabilityDefinition, ModelEntry } from '@harness/core';
import {
  createFakeApprovalStore,
  createFakeConversationStore,
  createFakeSettingsStore,
} from '@harness/core/testing';
import { z } from 'zod';
import { createHttpApp } from '../app.ts';
import { createFakeHttpDeps } from '../testing.ts';

function fakeCapability(id = 'test-cap'): CapabilityDefinition {
  return {
    id,
    title: 'Test Capability',
    description: 'A test capability',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ text: z.string() }),
    settingsSchema: z.object({ model: z.string() }),
    runner: {
      kind: 'agent',
      build: () =>
        ({
          stream: async () => ({
            fullStream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'text-delta', payload: { text: 'hello' } });
                controller.close();
              },
            }),
          }),
        }) as never,
      extractPrompt: () => 'test',
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

describe('POST /runs/:id/approve', () => {
  test('returns 404 for unknown run', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/runs/nonexistent/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'apr-1' }),
    });
    expect(res.status).toBe(404);
  });

  test('returns 404 when no pending approval', async () => {
    const deps = depsWithCapability();
    const app = createHttpApp(deps);

    await deps.runStore.create('run-1', 'simple-chat', '2026-04-24T00:00:00.000Z');

    const res = await app.request('/runs/run-1/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'apr-1' }),
    });
    expect(res.status).toBe(404);
  });

  test('resolves pending approval and returns 200', async () => {
    const approvalStore = createFakeApprovalStore();
    const deps = createFakeHttpDeps({
      ...depsWithCapability(),
      approvalStore,
    });
    const app = createHttpApp(deps);

    await deps.runStore.create('run-1', 'simple-chat', '2026-04-24T00:00:00.000Z');
    await approvalStore.createPending({
      id: 'apr-1',
      runId: 'run-1',
      payload: { plan: 'test' },
      status: 'pending',
      createdAt: '2026-04-24T00:00:00.000Z',
    });

    const res = await app.request('/runs/run-1/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'apr-1' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const resolved = await approvalStore.get('apr-1');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.decision?.kind).toBe('approve');
  });

  test('returns 409 for already resolved approval', async () => {
    const approvalStore = createFakeApprovalStore();
    const deps = createFakeHttpDeps({
      ...depsWithCapability(),
      approvalStore,
    });
    const app = createHttpApp(deps);

    await deps.runStore.create('run-1', 'simple-chat', '2026-04-24T00:00:00.000Z');
    await approvalStore.createPending({
      id: 'apr-1',
      runId: 'run-1',
      payload: {},
      status: 'pending',
      createdAt: '2026-04-24T00:00:00.000Z',
    });
    await approvalStore.resolve('apr-1', { kind: 'approve' }, '2026-04-24T00:01:00.000Z');

    const res = await app.request('/runs/run-1/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'apr-1' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /runs/:id/reject', () => {
  test('returns 404 for unknown run', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/runs/nonexistent/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'apr-1' }),
    });
    expect(res.status).toBe(404);
  });

  test('resolves pending approval with reject decision', async () => {
    const approvalStore = createFakeApprovalStore();
    const deps = createFakeHttpDeps({
      ...depsWithCapability(),
      approvalStore,
    });
    const app = createHttpApp(deps);

    await deps.runStore.create('run-1', 'simple-chat', '2026-04-24T00:00:00.000Z');
    await approvalStore.createPending({
      id: 'apr-1',
      runId: 'run-1',
      payload: { plan: 'test' },
      status: 'pending',
      createdAt: '2026-04-24T00:00:00.000Z',
    });

    const res = await app.request('/runs/run-1/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'apr-1', reason: 'bad plan' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const resolved = await approvalStore.get('apr-1');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.decision?.kind).toBe('reject');
  });
});

describe('GET /settings', () => {
  test('returns global settings by default', async () => {
    const settingsStore = createFakeSettingsStore();
    await settingsStore.set('global', 'model', 'gpt-4');
    const deps = createFakeHttpDeps({ settingsStore });
    const app = createHttpApp(deps);

    const res = await app.request('/settings');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.global.model).toBe('gpt-4');
    expect(body.capabilities).toEqual({});
  });

  test('returns per-capability settings merged with global', async () => {
    const settingsStore = createFakeSettingsStore();
    await settingsStore.set('global', 'model', 'gpt-4');
    await settingsStore.set('simple-chat', 'model', 'claude');
    const fakeCap: CapabilityDefinition = {
      id: 'simple-chat',
      title: 'Chat',
      description: '',
      inputSchema: {} as never,
      outputSchema: {} as never,
      settingsSchema: {} as never,
      runner: { kind: 'agent', build: () => ({}) as never, extractPrompt: () => '' },
    };
    const deps = createFakeHttpDeps({
      settingsStore,
      capabilityRegistry: {
        list: () => [fakeCap],
        get: (id: string) => (id === 'simple-chat' ? fakeCap : undefined),
      },
    });
    const app = createHttpApp(deps);

    const res = await app.request('/settings');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.capabilities['simple-chat'].values.model).toBe('claude');
  });
});

describe('PUT /settings', () => {
  test('updates settings and returns merged result', async () => {
    const settingsStore = createFakeSettingsStore();
    const deps = createFakeHttpDeps({ settingsStore });
    const app = createHttpApp(deps);

    const res = await app.request('/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: 'global', settings: { model: 'gpt-4', temp: 0.7 } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.global.model).toBe('gpt-4');
    expect(body.global.temp).toBe(0.7);
  });
});

describe('GET /conversations', () => {
  test('returns all conversations', async () => {
    const conversationStore = createFakeConversationStore();
    await conversationStore.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    const deps = createFakeHttpDeps({ conversationStore });
    const app = createHttpApp(deps);

    const res = await app.request('/conversations');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('c1');
  });

  test('filters by capabilityId', async () => {
    const conversationStore = createFakeConversationStore();
    await conversationStore.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    await conversationStore.create({
      id: 'c2',
      capabilityId: 'research',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    const deps = createFakeHttpDeps({ conversationStore });
    const app = createHttpApp(deps);

    const res = await app.request('/conversations?capabilityId=chat');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].capabilityId).toBe('chat');
  });
});

describe('GET /conversations/:id/messages', () => {
  test('returns messages rebuilt from events', async () => {
    const deps = createFakeHttpDeps();
    const app = createHttpApp(deps);

    await deps.conversationStore.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    await deps.runStore.create('r1', 'chat', '2026-01-01T00:00:00Z', 'c1');
    await deps.eventLog.append({
      runId: 'r1',
      seq: 0,
      ts: '2026-01-01T00:00:00Z',
      type: 'run.started',
      capabilityId: 'chat',
      input: { message: 'Hello' },
    });
    await deps.eventLog.append({
      runId: 'r1',
      seq: 1,
      ts: '2026-01-01T00:00:01Z',
      type: 'text.delta',
      text: 'Hi there!',
    });
    await deps.eventLog.append({
      runId: 'r1',
      seq: 2,
      ts: '2026-01-01T00:00:02Z',
      type: 'run.completed',
      output: null,
    });

    const res = await app.request('/conversations/c1/messages');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].role).toBe('user');
    expect(body[0].content).toBe('Hello');
    expect(body[1].role).toBe('assistant');
    expect(body[1].content).toBe('Hi there!');
  });

  test('returns 404 for unknown conversation', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/conversations/unknown/messages');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /conversations/:id', () => {
  test('cascade deletes and returns 204', async () => {
    const deps = createFakeHttpDeps();
    const app = createHttpApp(deps);

    await deps.conversationStore.create({
      id: 'c1',
      capabilityId: 'chat',
      createdAt: '2026-01-01T00:00:00Z',
      lastActivityAt: '2026-01-01T00:00:00Z',
    });
    await deps.runStore.create('r1', 'chat', '2026-01-01T00:00:00Z', 'c1');

    const res = await app.request('/conversations/c1', { method: 'DELETE' });
    expect(res.status).toBe(204);

    const check = await deps.conversationStore.get('c1');
    expect(check).toBeUndefined();
  });

  test('returns 404 for unknown conversation', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/conversations/unknown', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('GET /models', () => {
  test('returns models from provider resolver', async () => {
    const fakeModels: ModelEntry[] = [
      { id: 'ollama:llama3', provider: 'ollama', displayName: 'Llama 3' },
    ];
    const deps = createFakeHttpDeps({
      providerResolver: {
        resolve: () => undefined,
        list: () => fakeModels,
      },
    });
    const app = createHttpApp(deps);

    const res = await app.request('/models');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('ollama:llama3');
  });

  test('returns empty array when no providers configured', async () => {
    const app = createHttpApp(createFakeHttpDeps());
    const res = await app.request('/models');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
