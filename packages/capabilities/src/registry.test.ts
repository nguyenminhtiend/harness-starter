import { describe, expect, test } from 'bun:test';
import { createCapabilityRegistry } from './registry.ts';

describe('createCapabilityRegistry', () => {
  const registry = createCapabilityRegistry();

  test('list() returns at least simple-chat', () => {
    const caps = registry.list();
    expect(caps.length).toBeGreaterThanOrEqual(1);
    expect(caps.some((c) => c.id === 'simple-chat')).toBe(true);
  });

  test('get("simple-chat") returns the capability', () => {
    const cap = registry.get('simple-chat');
    expect(cap).toBeDefined();
    expect(cap?.id).toBe('simple-chat');
    expect(cap?.title).toBe('Simple Chat');
  });

  test('get("unknown") returns undefined', () => {
    const cap = registry.get('unknown');
    expect(cap).toBeUndefined();
  });
});
