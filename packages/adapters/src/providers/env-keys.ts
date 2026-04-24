import type { ProviderKeys } from '@harness/core';

export function loadProviderKeysFromEnv(): ProviderKeys {
  const keys: ProviderKeys = {};
  const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  const groq = process.env.GROQ_API_KEY;
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;

  if (google) {
    (keys as Record<string, string>).google = google;
  }
  if (openrouter) {
    (keys as Record<string, string>).openrouter = openrouter;
  }
  if (groq) {
    (keys as Record<string, string>).groq = groq;
  }
  if (ollamaBaseUrl) {
    (keys as Record<string, string>).ollamaBaseUrl = ollamaBaseUrl;
  }
  return keys;
}
