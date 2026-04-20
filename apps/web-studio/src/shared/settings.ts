export interface GlobalSettings {
  defaultModel: string;
  budgetUsd: number;
  budgetTokens: number;
  concurrency: number;
}

export interface ToolOverrides {
  [key: string]: unknown;
}

export type ApiKeyMask = { set: boolean };

export interface ToolSettingsView {
  values: ToolOverrides;
  inheritedFromGlobal: Record<string, boolean>;
}

export interface SettingsResponse {
  global: GlobalSettings;
  tools: Record<string, ToolSettingsView>;
}

export interface SettingsUpdateRequest {
  scope: 'global' | string;
  settings: Record<string, unknown>;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  defaultModel: 'google:gemini-2.5-flash-preview-04-17',
  budgetUsd: 0.5,
  budgetTokens: 200_000,
  concurrency: 3,
};
