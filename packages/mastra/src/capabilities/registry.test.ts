import { describe, expect, test } from 'bun:test';
import { createCapabilityRegistry } from './registry.ts';

describe('createCapabilityRegistry', () => {
  const registry = createCapabilityRegistry();

  test('list() returns simple-chat and deep-research', () => {
    const caps = registry.list();
    expect(caps.length).toBeGreaterThanOrEqual(2);
    expect(caps.some((c) => c.id === 'simple-chat')).toBe(true);
    expect(caps.some((c) => c.id === 'deep-research')).toBe(true);
  });

  test('get("simple-chat") returns the capability', () => {
    const cap = registry.get('simple-chat');
    expect(cap).toBeDefined();
    expect(cap?.id).toBe('simple-chat');
    expect(cap?.title).toBe('Simple Chat');
  });

  test('get("deep-research") returns the capability', () => {
    const cap = registry.get('deep-research');
    expect(cap).toBeDefined();
    expect(cap?.id).toBe('deep-research');
    expect(cap?.title).toBe('Deep Research');
    expect(cap?.supportsApproval).toBe(true);
  });

  test('get("unknown") returns undefined', () => {
    const cap = registry.get('unknown');
    expect(cap).toBeUndefined();
  });
});
