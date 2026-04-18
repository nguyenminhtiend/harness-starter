import { describe, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAgent } from '@harness/agent';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { fetchTool } from './fetch.ts';
import { fsTool } from './fs.ts';

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'stop' },
  ];
}

function toolCallScript(id: string, name: string, args: unknown): StreamEvent[] {
  return [
    { type: 'tool-call', id, name, args },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'tool-calls' },
  ];
}

describe('tools integration with createAgent', () => {
  test('fsTool write+read round-trip via agent', async () => {
    const ws = await mkdtemp(path.join(tmpdir(), 'harness-int-'));

    const provider = fakeProvider([
      {
        events: toolCallScript('tc1', 'fs', {
          operation: 'write',
          path: 'hello.txt',
          content: 'world',
        }),
      },
      {
        events: toolCallScript('tc2', 'fs', {
          operation: 'read',
          path: 'hello.txt',
        }),
      },
      { events: textScript('File contains: world') },
    ]);

    const agent = createAgent({
      provider,
      tools: [fsTool({ workspace: ws, mode: 'rw' })],
    });

    const result = await agent.run({ userMessage: 'Write and read hello.txt' });
    expect(result.finalMessage).toBe('File contains: world');
    expect(result.turns).toBe(3);

    await rm(ws, { recursive: true, force: true });
  });

  test('fetchTool via agent', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const provider = fakeProvider([
        {
          events: toolCallScript('tc1', 'fetch', {
            url: 'https://api.example.com/data',
            method: 'GET',
          }),
        },
        { events: textScript('Got the data.') },
      ]);

      const agent = createAgent({
        provider,
        tools: [fetchTool({ allow: ['api.example.com'] })],
      });

      const result = await agent.run({ userMessage: 'Fetch the data' });
      expect(result.finalMessage).toBe('Got the data.');
      expect(result.turns).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
