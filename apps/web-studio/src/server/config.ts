import { loadProviderKeysFromEnv, type ProviderKeys } from './infra/llm.ts';

export type { ProviderKeys } from './infra/llm.ts';

export interface EnvConfig {
  HOST: string;
  PORT: number;
  DATA_DIR: string;
  providerKeys: ProviderKeys;
}

export function loadConfig(): EnvConfig {
  return {
    HOST: process.env.HOST ?? '127.0.0.1',
    PORT: Number(process.env.PORT ?? 3000),
    DATA_DIR: process.env.DATA_DIR ?? `${process.env.HOME ?? '.'}/.web-studio`,
    providerKeys: loadProviderKeysFromEnv(),
  };
}
