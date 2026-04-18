import { envConfig } from '@harness/core';
import { z } from 'zod';

const schema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  MODEL_ID: z.string().default('openrouter/free'),
  SYSTEM_PROMPT: z.string().optional(),
});

export const config = envConfig(schema);
