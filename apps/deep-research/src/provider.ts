import { aiSdkProvider } from '@harness/core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from './config.ts';

const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });

export function createProvider(modelId?: string) {
  const model = openrouter.chat(modelId ?? config.MODEL_ID);
  return aiSdkProvider(model);
}
