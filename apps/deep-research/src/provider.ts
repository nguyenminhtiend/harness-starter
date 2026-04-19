import { aiSdkProvider } from '@harness/core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from './config.ts';

export function createProvider(modelId?: string) {
  const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });
  const model = openrouter.chat(modelId ?? config.MODEL_ID);
  return aiSdkProvider(model);
}
