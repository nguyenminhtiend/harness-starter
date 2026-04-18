import { aiSdkProvider } from '@harness/core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from './config.ts';

const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });

// Swap this one line to change provider (see .env.example for Ollama instructions)
const model = openrouter.chat(config.MODEL_ID);

export const provider = aiSdkProvider(model);
