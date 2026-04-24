import { Mastra } from '@mastra/core';
import type { Workflow } from '@mastra/core/workflows';
import { LibSQLStore } from '@mastra/libsql';

export interface MastraSingletonConfig {
  readonly workflows: Record<string, Workflow>;
  readonly storageUrl?: string;
}

let instance: Mastra | undefined;

export function getMastraInstance(config: MastraSingletonConfig): Mastra {
  if (!instance) {
    instance = new Mastra({
      workflows: config.workflows,
      storage: new LibSQLStore({
        id: 'harness-mastra',
        url: config.storageUrl ?? 'file:./.mastra/mastra.db',
      }),
    });
  }
  return instance;
}

export function resetMastraInstance(): void {
  instance = undefined;
}
