import { describe, expect, test } from 'bun:test';
import type { Message, Provider } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { insertCacheBreakpoints } from './cache.ts';

function cachingProvider(): Provider {
  return fakeProvider([], { capabilities: { caching: true } });
}

function nonCachingProvider(): Provider {
  return fakeProvider([]);
}

describe('insertCacheBreakpoints', () => {
  test('no-ops when provider lacks caching', () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    const result = insertCacheBreakpoints(messages, nonCachingProvider());
    expect(result).toEqual(messages);
  });

  test('inserts cacheBoundary after system prompt', () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    const result = insertCacheBreakpoints(messages, cachingProvider());
    expect(result[0]?.cacheBoundary).toBe(true);
    expect(result[1]?.cacheBoundary).toBeUndefined();
  });

  test('respects existing cacheBoundary', () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi', cacheBoundary: true },
      { role: 'assistant', content: 'hello' },
    ];
    const result = insertCacheBreakpoints(messages, cachingProvider());
    // System should get boundary since it comes before the manual one
    expect(result[0]?.cacheBoundary).toBe(true);
  });

  test('does not duplicate if system already has cacheBoundary', () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys', cacheBoundary: true },
      { role: 'user', content: 'hi' },
    ];
    const result = insertCacheBreakpoints(messages, cachingProvider());
    expect(result[0]?.cacheBoundary).toBe(true);
    // No other boundaries added
    expect(result[1]?.cacheBoundary).toBeUndefined();
  });
});
