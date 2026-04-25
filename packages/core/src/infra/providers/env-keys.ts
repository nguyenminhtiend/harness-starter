import type { ProviderKeys } from './types.ts';

const ENV_MAP: ReadonlyArray<[string, string]> = [
  ['google', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['openrouter', 'OPENROUTER_API_KEY'],
  ['groq', 'GROQ_API_KEY'],
  ['ollamaBaseUrl', 'OLLAMA_BASE_URL'],
];

export function loadProviderKeysFromEnv(): ProviderKeys {
  const keys: Record<string, string> = {};
  for (const [name, envVar] of ENV_MAP) {
    const value = process.env[envVar];
    if (value) {
      keys[name] = value;
    }
  }
  return keys;
}
