import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { aiSdkProvider, type Provider } from '@harness/core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ModelSpec, ProviderId, ProviderKeys } from './types.ts';

export function parseModelSpec(raw: string): ModelSpec {
  const idx = raw.indexOf(':');
  if (idx === -1) {
    return { provider: 'openrouter', model: raw };
  }
  return { provider: raw.slice(0, idx) as ProviderId, model: raw.slice(idx + 1) };
}

export function createProvider(keys: ProviderKeys, spec: string): Provider {
  const { provider, model } = parseModelSpec(spec);

  if (provider === 'google') {
    const key = keys.google;
    if (!key) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured');
    }
    const google = createGoogleGenerativeAI({ apiKey: key });
    return aiSdkProvider(google(model));
  }

  if (provider === 'openrouter') {
    const key = keys.openrouter;
    if (!key) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }
    const openrouter = createOpenRouter({ apiKey: key });
    return aiSdkProvider(openrouter.chat(model));
  }

  if (provider === 'groq') {
    const key = keys.groq;
    if (!key) {
      throw new Error('GROQ_API_KEY not configured');
    }
    const groq = createGroq({ apiKey: key });
    return aiSdkProvider(groq(model));
  }

  throw new Error(
    `Unknown provider "${provider}". Use "google:", "openrouter:", or "groq:" prefix.`,
  );
}
