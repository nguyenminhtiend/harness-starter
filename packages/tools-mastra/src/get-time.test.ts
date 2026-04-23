import { describe, expect, test } from 'bun:test';
import { getTimeTool } from './get-time.ts';

describe('getTimeTool', () => {
  test('has correct id and description', () => {
    expect(getTimeTool.id).toBe('get_time');
    expect(getTimeTool.description).toBeDefined();
  });

  test('returns UTC time by default', async () => {
    const result = await getTimeTool.execute({}, {});
    expect(result).toHaveProperty('ok', true);
    if (!('ok' in result) || !result.ok) {
      return;
    }
    expect(result.timezone).toBe('UTC');
    expect(result.iso).toBeDefined();
    expect(typeof result.unix).toBe('number');
    expect(result.formatted).toBeDefined();
  });

  test('returns time for explicit timezone', async () => {
    const result = await getTimeTool.execute({ timezone: 'America/Los_Angeles' }, {});
    expect(result).toHaveProperty('ok', true);
    if (!('ok' in result) || !result.ok) {
      return;
    }
    expect(result.timezone).toBe('America/Los_Angeles');
    expect(result.formatted).toContain('Pacific');
  });

  test('returns structured error for invalid timezone', async () => {
    const result = await getTimeTool.execute({ timezone: 'Not/A/Real/Zone' }, {});
    expect(result).toHaveProperty('ok', false);
    if (!('ok' in result) || result.ok) {
      return;
    }
    expect(result.error).toContain('Invalid timezone');
  });
});
