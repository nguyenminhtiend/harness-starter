import { createLanguageModel } from './model-factory.ts';

export function resolveModel(raw: unknown): unknown {
  if (typeof raw === 'string') {
    return createLanguageModel(raw);
  }
  return raw;
}
