export interface ProviderKeys {
  google?: string;
  openrouter?: string;
  groq?: string;
}

export interface EnvConfig {
  HOST: string;
  PORT: number;
  DATA_DIR: string;
  providerKeys: ProviderKeys;
}

export function loadConfig(): EnvConfig {
  const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
  const openrouter = process.env.OPENROUTER_API_KEY ?? '';
  const groq = process.env.GROQ_API_KEY ?? '';

  return {
    HOST: process.env.HOST ?? '127.0.0.1',
    PORT: Number(process.env.PORT ?? 3000),
    DATA_DIR: process.env.DATA_DIR ?? `${process.env.HOME ?? '.'}/.web-studio`,
    providerKeys: {
      ...(google ? { google } : {}),
      ...(openrouter ? { openrouter } : {}),
      ...(groq ? { groq } : {}),
    },
  };
}
