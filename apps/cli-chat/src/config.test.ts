import { describe, expect, test } from 'bun:test';
import { envConfig } from '@harness/core';
import { z } from 'zod';

const schema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  MODEL_ID: z.string().default('anthropic/claude-sonnet-4'),
  SYSTEM_PROMPT: z.string().optional(),
});

describe('cli-chat config', () => {
  test('parses valid env', () => {
    const cfg = envConfig(schema, {
      OPENROUTER_API_KEY: 'sk-or-test-123',
      MODEL_ID: 'openai/gpt-4o',
    });
    expect(cfg.OPENROUTER_API_KEY).toBe('sk-or-test-123');
    expect(cfg.MODEL_ID).toBe('openai/gpt-4o');
    expect(cfg.SYSTEM_PROMPT).toBeUndefined();
  });

  test('applies MODEL_ID default', () => {
    const cfg = envConfig(schema, { OPENROUTER_API_KEY: 'sk-or-test' });
    expect(cfg.MODEL_ID).toBe('anthropic/claude-sonnet-4');
  });

  test('rejects missing OPENROUTER_API_KEY', () => {
    expect(() => envConfig(schema, {})).toThrow('Environment config validation failed');
  });

  test('rejects empty OPENROUTER_API_KEY', () => {
    expect(() => envConfig(schema, { OPENROUTER_API_KEY: '' })).toThrow();
  });
});
