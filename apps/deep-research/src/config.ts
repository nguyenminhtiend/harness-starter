import { envConfig } from '@harness/core';
import { z } from 'zod';

const schema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  MODEL_ID: z.string().default('openrouter/auto'),
  BRAVE_API_KEY: z.string().optional(),
  BUDGET_USD: z.coerce.number().default(0.5),
  BUDGET_TOKENS: z.coerce.number().int().default(200_000),
  REPORT_DIR: z.string().default('./reports'),
});

export const config = envConfig(schema);
export type Config = typeof config;
