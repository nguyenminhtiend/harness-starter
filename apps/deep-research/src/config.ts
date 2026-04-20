import { envConfig } from '@harness/core';
import { z } from 'zod';

const schema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  MODEL_ID: z.string().default('openrouter/free'),
  BRAVE_API_KEY: z.string().optional(),
  BUDGET_USD: z.coerce.number().default(0.5),
  BUDGET_TOKENS: z.coerce.number().int().default(200_000),
  REPORT_DIR: z.string().default('./reports'),
  DATA_DIR: z.string().default(`${process.env.HOME ?? '.'}/.deep-research`),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().optional(),
});

export const config = envConfig(schema);
export type Config = typeof config;
