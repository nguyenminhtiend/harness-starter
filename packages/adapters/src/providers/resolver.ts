import type { ModelEntry, ProviderResolver } from '@harness/core';
import { knownModels } from './catalog.ts';

function providerForModel(modelId: string): string {
  const idx = modelId.indexOf(':');
  if (idx === -1) {
    return modelId;
  }
  return modelId.slice(0, idx);
}

export function createProviderResolver(): ProviderResolver {
  return {
    resolve(modelId, keys) {
      const provider = providerForModel(modelId);
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
