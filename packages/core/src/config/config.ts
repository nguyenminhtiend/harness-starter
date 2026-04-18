import type { output, ZodType } from 'zod';
import { ValidationError } from '../errors.ts';

export function defineConfig<S extends ZodType>(schema: S, value: unknown): output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = 'error' in result ? (result.error as { issues?: unknown }).issues : result;
    throw new ValidationError('Config validation failed', {
      zodIssues: issues,
    });
  }
  return result.data as output<S>;
}

export function envConfig<S extends ZodType>(schema: S): output<S> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const error =
      'error' in result
        ? (result.error as { issues?: Array<{ path?: unknown[]; message?: string }> })
        : undefined;
    const issues = error?.issues ?? [];
    const missing = issues
      .map((i) => {
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
