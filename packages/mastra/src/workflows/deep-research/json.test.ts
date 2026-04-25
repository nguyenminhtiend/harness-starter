import { describe, expect, test } from 'bun:test';
import { extractJson } from './json.ts';

describe('extractJson', () => {
  test('returns trimmed text when no code fence is present', () => {
    expect(extractJson('  {"a":1}  ')).toBe('{"a":1}');
  });

  test('extracts content from ```json fenced block', () => {
    const input = '```json\n{"a":1}\n```';
    expect(extractJson(input)).toBe('{"a":1}');
  });

  test('extracts content from ``` fenced block without language tag', () => {
    const input = '```\n{"a":1}\n```';
    expect(extractJson(input)).toBe('{"a":1}');
  });

  test('handles surrounding text outside the fence', () => {
    const input = 'Here is the result:\n```json\n{"a":1}\n```\nDone.';
    expect(extractJson(input)).toBe('{"a":1}');
  });
});
