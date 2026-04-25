import { knownModels } from './catalog.ts';
import { parseModelId } from './parse-model-id.ts';
import type { ModelEntry, ProviderResolver } from './types.ts';

export function createProviderResolver(): ProviderResolver {
  return {
    resolve(modelId, keys) {
      const { provider } = parseModelId(modelId);
      if (provider !== 'ollama' && !keys[provider]) {
        return undefined;
      }
      const known = knownModels.find((m) => m.id === modelId);
      return {
        modelId,
        provider,
        displayName: known?.displayName ?? modelId,
      };
    },

    list(keys) {
      return knownModels.filter((m): m is ModelEntry => {
        if (m.provider === 'ollama') {
          return true;
        }
        return Boolean(keys[m.provider]);
      });
    },
  };
}
