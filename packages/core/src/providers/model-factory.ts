import { createOllama } from 'ollama-ai-provider-v2';
import { loadProviderKeysFromEnv } from './env-keys.ts';
import { parseModelId } from './parse-model-id.ts';
import type { ProviderKeys } from './types.ts';

export function createLanguageModel(modelId: string, keys?: ProviderKeys): unknown {
  const { provider, model } = parseModelId(modelId);
  if (provider === model) {
    throw new Error(`Invalid model ID format: ${modelId} (expected provider:model)`);
  }
  const resolved = keys ?? loadProviderKeysFromEnv();

  switch (provider) {
    case 'ollama': {
      const baseURL = resolved.ollamaBaseUrl ?? 'http://localhost:11434/api';
      return createOllama({ baseURL })(model);
    }
    default:
      throw new Error(`Unsupported provider: "${provider}". Currently supported: ollama.`);
  }
}
