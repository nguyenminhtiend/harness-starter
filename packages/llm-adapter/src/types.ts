export type ProviderId = 'google' | 'openrouter' | 'groq';

export interface ModelSpec {
  provider: ProviderId;
  model: string;
}

export interface ProviderKeys {
  google?: string;
  openrouter?: string;
  groq?: string;
}

export interface ModelEntry {
  id: string;
  label: string;
  provider: ProviderId;
}
