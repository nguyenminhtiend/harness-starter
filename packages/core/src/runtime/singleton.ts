import { Mastra } from '@mastra/core';
import type { Workflow } from '@mastra/core/workflows';
import { LibSQLStore } from '@mastra/libsql';

export interface RuntimeSingletonConfig {
  readonly workflows: Record<string, Workflow>;
  readonly storageUrl?: string;
}

const instances = new Map<string, Mastra>();

function configKey(config: RuntimeSingletonConfig): string {
  const wfKeys = Object.keys(config.workflows).sort().join(',');
  return `${wfKeys}|${config.storageUrl ?? 'default'}`;
}

export function getRuntimeInstance(config: RuntimeSingletonConfig): Mastra {
  const key = configKey(config);
  const existing = instances.get(key);
  if (existing) {
    return existing;
  }

  const mastra = new Mastra({
    workflows: config.workflows,
    storage: new LibSQLStore({
      id: 'harness-runtime',
      url: config.storageUrl ?? 'file:./.mastra/mastra.db',
    }),
  });
  instances.set(key, mastra);
  return mastra;
}

export function resetRuntimeInstance(): void {
  instances.clear();
}
