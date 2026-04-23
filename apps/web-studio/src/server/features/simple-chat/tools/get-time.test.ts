import { describe, expect, test } from 'bun:test';
import { getTimeTool } from './get-time.ts';

const ctx = {
  runId: 'test-run',
  conversationId: 'test-conv',
  signal: new AbortController().signal,
};

describe('getTimeTool', () => {
  test('returns UTC time by default', async () => {
    const result = await getTimeTool.execute({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.timezone).toBe('UTC');
    expect(result.iso).toBeDefined();
    expect(typeof result.unix).toBe('number');
    expect(result.formatted).toBeDefined();
  });

  test('returns time for explicit timezone', async () => {
    const result = await getTimeTool.execute({ timezone: 'America/Los_Angeles' }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.timezone).toBe('America/Los_Angeles');
    expect(result.iso).toBeDefined();
    expect(result.formatted).toContain('Pacific');
  });

  test('returns structured error for invalid timezone', async () => {
    const result = await getTimeTool.execute({ timezone: 'Not/A/Real/Zone' }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain('Invalid timezone');
  });

  test('has correct tool metadata', () => {
    expect(getTimeTool.name).toBe('get_time');
    expect(getTimeTool.description).toBeDefined();
  });
});
