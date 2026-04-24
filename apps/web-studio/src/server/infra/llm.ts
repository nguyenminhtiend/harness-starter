import { createOllama } from 'ollama-ai-provider-v2';

export type ProviderId = 'google' | 'openrouter' | 'groq' | 'ollama';

export interface ProviderKeys {
  google?: string;
  openrouter?: string;
  groq?: string;
  ollamaBaseUrl?: string;
}

export interface ModelEntry {
  id: string;
  label: string;
  provider: ProviderId;
}

export const knownModels: readonly ModelEntry[] = [
  { id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'google:gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'google:gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },

  { id: 'groq:llama-3.3-70b-versatile', label: 'Llama 3.3 70B', provider: 'groq' },
  {
    id: 'groq:deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill 70B',
    provider: 'groq',
  },
  {
    id: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B',
    provider: 'groq',
  },
  { id: 'groq:qwen-qwq-32b', label: 'Qwen QWQ 32B', provider: 'groq' },
  { id: 'groq:gemma2-9b-it', label: 'Gemma 2 9B', provider: 'groq' },

  {
    id: 'openrouter:anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'openrouter',
  },
  { id: 'openrouter:openai/gpt-4.1', label: 'GPT-4.1', provider: 'openrouter' },
  { id: 'openrouter:openai/gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openrouter' },
  {
    id: 'openrouter:google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash (OR)',
    provider: 'openrouter',
  },

  { id: 'ollama:qwen2.5:3b', label: 'Qwen 2.5 3B (local)', provider: 'ollama' },
  { id: 'ollama:llama3.2:3b', label: 'Llama 3.2 3B (local)', provider: 'ollama' },
  { id: 'ollama:gemma3:4b', label: 'Gemma 3 4B (local)', provider: 'ollama' },
];

export function listAvailableModels(keys: ProviderKeys): ModelEntry[] {
  return knownModels.filter((m) => {
    if (m.provider === 'ollama') {
      return true;
    }
    return Boolean(keys[m.provider]);
  });
}

import type { MastraModelConfig } from '@mastra/core/llm';

/**
 * Resolve a `provider:model` string into a Mastra-compatible model config.
 * For `ollama:*`, uses the ollama-ai-provider SDK.
 * All other prefixes are passed through as plain strings for Mastra's router.
 */
export function resolveModel(modelId: string): MastraModelConfig {
  if (modelId.startsWith('ollama:')) {
    const modelName = modelId.slice('ollama:'.length);
    const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    const ollama = createOllama({ baseURL: `${baseURL}/api` });
    return ollama.chat(modelName) as MastraModelConfig;
  }
  return modelId as MastraModelConfig;
}

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
