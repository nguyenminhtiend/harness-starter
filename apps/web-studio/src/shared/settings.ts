export interface GlobalSettings {
  defaultModel: string;
  budgetUsd: number;
  budgetTokens: number;
  concurrency: number;
}

export interface ToolOverrides {
  [key: string]: unknown;
}

export interface SettingsResponse {
  global: GlobalSettings;
  tools: Record<string, ToolOverrides>;
}

export interface SettingsUpdateRequest {
  scope: 'global' | string;
  settings: Record<string, unknown>;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  defaultModel: 'openrouter/free',
  budgetUsd: 0.5,
  budgetTokens: 200_000,
  concurrency: 3,
};
