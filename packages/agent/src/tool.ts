import type { Tool } from './types.ts';

export function tool<I, O>(def: Tool<I, O>): Tool<I, O> {
  return def;
}
