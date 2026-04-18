import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { ValidationError } from '../errors.ts';
import { defineConfig, envConfig } from './config.ts';

describe('defineConfig', () => {
  test('valid config passes through', () => {
    const schema = z.object({ port: z.number(), host: z.string() });
    const result = defineConfig(schema, { port: 3000, host: 'localhost' });
    expect(result).toEqual({ port: 3000, host: 'localhost' });
  });

  test('applies transforms', () => {
    const schema = z.object({ name: z.string().trim() });
    const result = defineConfig(schema, { name: '  hello  ' });
    expect(result.name).toBe('hello');
  });

  test('applies defaults', () => {
    const schema = z.object({ port: z.number().default(8080) });
    const result = defineConfig(schema, {});
    expect(result.port).toBe(8080);
  });

  test('throws ValidationError on invalid config', () => {
    const schema = z.object({ port: z.number() });
    expect(() => defineConfig(schema, { port: 'not a number' } as never)).toThrow(ValidationError);
  });

  test('ValidationError contains zodIssues', () => {
    const schema = z.object({ port: z.number() });
    try {
      defineConfig(schema, { port: 'bad' } as never);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).zodIssues).toBeDefined();
    }
  });
});

describe('envConfig', () => {
  test('reads from process.env and coerces types', () => {
    process.env.TEST_PORT = '3000';
    process.env.TEST_HOST = 'localhost';
    const schema = z.object({
      TEST_PORT: z.coerce.number(),
      TEST_HOST: z.string(),
    });
    const result = envConfig(schema);
    expect(result.TEST_PORT).toBe(3000);
    expect(result.TEST_HOST).toBe('localhost');
    delete process.env.TEST_PORT;
    delete process.env.TEST_HOST;
  });

  test('throws ValidationError for missing required env var', () => {
    delete process.env.REQUIRED_VAR;
    const schema = z.object({
      REQUIRED_VAR: z.string(),
    });
    expect(() => envConfig(schema)).toThrow(ValidationError);
  });

  test('error message mentions the missing variable', () => {
    delete process.env.MY_API_KEY;
    const schema = z.object({
      MY_API_KEY: z.string(),
    });
    try {
      envConfig(schema);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).message).toContain('MY_API_KEY');
    }
  });

  test('uses defaults when env var is missing', () => {
    delete process.env.OPT_VAR;
    const schema = z.object({
      OPT_VAR: z.string().default('fallback'),
    });
    const result = envConfig(schema);
    expect(result.OPT_VAR).toBe('fallback');
  });
});
