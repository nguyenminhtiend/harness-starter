import { createOllama } from 'ollama-ai-provider-v2';
import { loadProviderKeysFromEnv } from './env-keys.ts';

export function createLanguageModel(modelId: string): unknown {
  const colonIdx = modelId.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(`Invalid model ID format: ${modelId} (expected provider:model)`);
  }
  const provider = modelId.slice(0, colonIdx);
  const model = modelId.slice(colonIdx + 1);
  const keys = loadProviderKeysFromEnv();

  switch (provider) {
    case 'ollama': {
      const baseURL = keys.ollamaBaseUrl ?? 'http://localhost:11434/api';
      return createOllama({ baseURL })(model);
    }
    default:
      throw new Error(`Unsupported provider: "${provider}". Currently supported: ollama.`);
  }
}
