import type { ProviderKeys } from './types.ts';

export function loadProviderKeysFromEnv(): ProviderKeys {
  const keys: ProviderKeys = {};
  const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  const groq = process.env.GROQ_API_KEY;
  if (google) {
    keys.google = google;
  }
  if (openrouter) {
    keys.openrouter = openrouter;
  }
  if (groq) {
    keys.groq = groq;
  }
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
  if (ollamaBaseUrl) {
    keys.ollamaBaseUrl = ollamaBaseUrl;
  }
  return keys;
}
