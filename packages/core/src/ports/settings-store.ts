export interface SettingsStore {
  get(scope: string, key: string): Promise<unknown>;
  set(scope: string, key: string, value: unknown): Promise<void>;
  getAll(scope: string): Promise<Record<string, unknown>>;
  delete(scope: string, key: string): Promise<void>;
}
