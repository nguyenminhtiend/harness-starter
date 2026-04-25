import { describe, expect, it } from 'bun:test';
import { createCryptoIdGen } from './id-gen.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('CryptoIdGen', () => {
  it('returns a valid UUID', () => {
    const gen = createCryptoIdGen();
    expect(gen.next()).toMatch(UUID_RE);
  });

  it('returns unique ids', () => {
    const gen = createCryptoIdGen();
    const ids = new Set(Array.from({ length: 100 }, () => gen.next()));
    expect(ids.size).toBe(100);
  });
});
