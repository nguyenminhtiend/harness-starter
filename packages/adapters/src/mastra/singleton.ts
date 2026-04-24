import { Mastra } from '@mastra/core';
import type { Workflow } from '@mastra/core/workflows';
import { LibSQLStore } from '@mastra/libsql';

export interface MastraSingletonConfig {
  readonly workflows: Record<string, Workflow>;
  readonly storageUrl?: string;
}

const instances = new Map<string, Mastra>();

function configKey(config: MastraSingletonConfig): string {
  const wfKeys = Object.keys(config.workflows).sort().join(',');
  return `${wfKeys}|${config.storageUrl ?? 'default'}`;
}

export function getMastraInstance(config: MastraSingletonConfig): Mastra {
  const key = configKey(config);
  const existing = instances.get(key);
  if (existing) {
    return existing;
  }

  const mastra = new Mastra({
    workflows: config.workflows,
    storage: new LibSQLStore({
      id: 'harness-mastra',
      url: config.storageUrl ?? 'file:./.mastra/mastra.db',
    }),
  });
  instances.set(key, mastra);
  return mastra;
}

export function resetMastraInstance(): void {
  instances.clear();
}
