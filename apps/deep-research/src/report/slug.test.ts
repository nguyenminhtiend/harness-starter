import { describe, expect, it } from 'bun:test';
import { slugify } from './slug.ts';

describe('slugify', () => {
  it('converts a question to lowercase kebab-case', () => {
    expect(slugify('What is CRDT?')).toBe('what-is-crdt');
  });

  it('strips special characters and punctuation', () => {
    expect(slugify('CRDTs vs OT — what are the tradeoffs?')).toBe(
      'crdts-vs-ot-what-are-the-tradeoffs',
    );
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --hello world--  ')).toBe('hello-world');
  });

  it('truncates to 60 characters without cutting mid-word', () => {
    const long = 'What are the tradeoffs between CRDTs and OT for collaborative editing in 2026';
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).not.toEndWith('-');
    expect(slug).toBe('what-are-the-tradeoffs-between-crdts-and-ot-for');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('untitled');
  });

  it('handles whitespace-only string', () => {
    expect(slugify('   ')).toBe('untitled');
  });
});
