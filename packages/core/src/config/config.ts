import type { output, ZodType } from 'zod';
import { ValidationError } from '../errors.ts';

export function defineConfig<S extends ZodType>(schema: S, value: unknown): output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Config validation failed', {
      zodIssues: (result as { error?: { issues?: unknown } }).error?.issues ?? null,
    });
  }
  return result.data as output<S>;
}

export function envConfig<S extends ZodType>(
  schema: S,
  env?: Record<string, string | undefined>,
): output<S> {
  const source = env ?? (typeof process !== 'undefined' ? process.env : {});
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error?.issues ?? [];
    const missing = issues
      .map((i: { path?: unknown[]; message?: string }) => {
        const path = Array.isArray(i.path) ? i.path.join('.') : 'unknown';
        return `  ${path}: ${i.message ?? 'invalid'}`;
      })
      .join('\n');
    throw new ValidationError(`Environment config validation failed:\n${missing}`, {
      zodIssues: issues,
    });
  }
  return result.data as output<S>;
}
