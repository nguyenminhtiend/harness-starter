export interface SettingsStore {
  get(scope: string, key: string): Promise<unknown>;
  set(scope: string, key: string, value: unknown): Promise<void>;
  getAll(scope: string): Promise<Record<string, unknown>>;
  delete(scope: string, key: string): Promise<void>;
}

export function createInMemorySettingsStore(): SettingsStore {
  const store = new Map<string, unknown>();
  const compositeKey = (scope: string, k: string) => `${scope}:${k}`;

  return {
    async get(scope, key) {
      return store.get(compositeKey(scope, key));
    },

    async set(scope, key, value) {
      store.set(compositeKey(scope, key), value);
    },

    async getAll(scope) {
      const prefix = `${scope}:`;
      const result: Record<string, unknown> = {};
      for (const [k, v] of store) {
        if (k.startsWith(prefix)) {
          result[k.slice(prefix.length)] = v;
        }
      }
      return result;
    },

    async delete(scope, key) {
      store.delete(compositeKey(scope, key));
    },
  };
}
