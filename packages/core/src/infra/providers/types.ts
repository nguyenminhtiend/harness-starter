export interface ModelConfig {
  readonly modelId: string;
  readonly provider: string;
  readonly displayName: string;
}

export interface ModelEntry {
  readonly id: string;
  readonly provider: string;
  readonly displayName: string;
}

export interface ProviderKeys {
  readonly [provider: string]: string | undefined;
}

export interface ProviderResolver {
  resolve(modelId: string, keys: ProviderKeys): ModelConfig | undefined;
  list(keys: ProviderKeys): ModelEntry[];
}
