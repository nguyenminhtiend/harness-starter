import type { ProviderKeys } from './types.ts';

export function loadProviderKeysFromEnv(): ProviderKeys {
  const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY || undefined;
  const openrouter = process.env.OPENROUTER_API_KEY || undefined;
  const groq = process.env.GROQ_API_KEY || undefined;

  return {
    ...(google ? { google } : {}),
    ...(openrouter ? { openrouter } : {}),
    ...(groq ? { groq } : {}),
  };
}
