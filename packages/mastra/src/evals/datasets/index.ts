import type { Mastra } from '@mastra/core';

export interface DatasetDefinition {
  name: string;
  description?: string;
  items: Array<{
    input: unknown;
    groundTruth?: unknown;
  }>;
}

/**
 * All dataset definitions. Each Phase 1–4 task adds its dataset here.
 * Studio discovers them after `seedDatasets()` writes them to LibSQL.
 */
export const allDatasets: DatasetDefinition[] = [];

/**
 * Idempotently seed all dataset definitions into the Mastra instance's storage.
 * Skips datasets that already exist (matched by name).
 */
export async function seedDatasets(mastra: Mastra): Promise<void> {
  for (const def of allDatasets) {
    try {
      await mastra.datasets.get({ id: def.name });
    } catch {
      const dataset = await mastra.datasets.create({
        name: def.name,
        ...(def.description ? { description: def.description } : {}),
      });
      if (def.items.length > 0) {
        await dataset.addItems({ items: def.items });
      }
    }
  }
}
