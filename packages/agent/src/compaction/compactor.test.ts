import { describe, expect, test } from 'bun:test';
import type { Message } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { summarizingCompactor } from './compactor.ts';

function msg(role: Message['role'], content: string): Message {
  return { role, content };
}

describe('summarizingCompactor', () => {
  test('passes through when under token threshold', async () => {
    const compactor = summarizingCompactor({ maxTokens: 10_000 });
    const messages = [
      msg('system', 'You are helpful.'),
      msg('user', 'Hi'),
      msg('assistant', 'Hello!'),
    ];

    const result = await compactor.compact(messages, {
      provider: fakeProvider([]),
      runId: 'r1',
      signal: new AbortController().signal,
    });

    expect(result).toEqual(messages);
  });

  test('compacts when over token threshold', async () => {
    const longContent = 'x'.repeat(1000);
    const messages: Message[] = [
      msg('system', 'sys'),
      ...Array.from({ length: 20 }, (_, i) => msg('user', `${longContent} ${i}`)),
    ];

    const summaryProvider = fakeProvider([
      {
        events: [
          { type: 'text-delta', delta: 'Summary of conversation' },
          { type: 'usage', tokens: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } },
          { type: 'finish', reason: 'stop' },
        ],
      },
    ]);

    const compactor = summarizingCompactor({
      maxTokens: 100,
      keepLastN: 3,
      summarizer: summaryProvider,
    });

    const result = await compactor.compact(messages, {
      provider: fakeProvider([]),
      runId: 'r1',
      signal: new AbortController().signal,
    });

    // system + summary + last 3
    expect(result).toHaveLength(5);
    expect(result[0]?.role).toBe('system');
    expect(result[1]?.content as string).toContain('Summary');
  });

  test('preserves all messages when history is short', async () => {
    const compactor = summarizingCompactor({ maxTokens: 10, keepLastN: 10 });
    const messages = [msg('user', 'Hi'), msg('assistant', 'Hello')];

    const result = await compactor.compact(messages, {
      provider: fakeProvider([]),
      runId: 'r1',
      signal: new AbortController().signal,
    });

    expect(result).toEqual(messages);
  });
});
