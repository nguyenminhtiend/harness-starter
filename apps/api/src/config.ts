import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    port: process.env.PORT,
    host: process.env.HOST,
    logLevel: process.env.LOG_LEVEL,
  });
}
