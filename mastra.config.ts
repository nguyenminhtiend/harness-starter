import { buildMastraConfig } from '@harness/capabilities';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

const model = process.env.MASTRA_MODEL ?? 'openai/gpt-4o';

const storage = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.MASTRA_DB_URL ?? 'file:./.mastra/mastra.db',
});

const { agents, workflows } = buildMastraConfig({ model });

export const mastra = new Mastra({
  agents,
  workflows,
  storage,
});
